"""
Notification service for webhook delivery.

Handles:
- Webhook configuration management
- Webhook delivery with retry logic
- Delivery logging
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

import httpx

from app.db.session import get_db

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAYS = [1.0, 2.0, 4.0]  # Exponential backoff: 1s, 2s, 4s
WEBHOOK_TIMEOUT = 10.0  # seconds


class NotificationService:
    """Service for managing and sending webhook notifications."""

    # =========================================================================
    # Settings Management
    # =========================================================================

    async def get_settings(self, user_id: str) -> dict:
        """
        Get notification settings for a user.
        
        Returns default settings if none exist.
        """
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT * FROM notification_settings WHERE user_id = ?",
                (user_id,),
            )
            row = await cursor.fetchone()
            
            if row is None:
                return {
                    "webhook_url": None,
                    "webhook_enabled": False,
                    "notify_on_complete": True,
                    "notify_on_failure": True,
                }
            
            return {
                "webhook_url": row["webhook_url"],
                "webhook_enabled": bool(row["webhook_enabled"]),
                "notify_on_complete": bool(row["notify_on_complete"]),
                "notify_on_failure": bool(row["notify_on_failure"]),
            }

    async def update_settings(
        self,
        user_id: str,
        webhook_url: Optional[str] = None,
        webhook_enabled: Optional[bool] = None,
        notify_on_complete: Optional[bool] = None,
        notify_on_failure: Optional[bool] = None,
    ) -> dict:
        """
        Update notification settings for a user.
        
        Creates settings if they don't exist (upsert).
        """
        now = datetime.utcnow().isoformat()
        
        async with get_db() as db:
            # Check if settings exist
            cursor = await db.execute(
                "SELECT settings_id FROM notification_settings WHERE user_id = ?",
                (user_id,),
            )
            existing = await cursor.fetchone()
            
            if existing:
                # Update existing settings
                updates = []
                params = []
                
                if webhook_url is not None:
                    updates.append("webhook_url = ?")
                    params.append(webhook_url if webhook_url else None)
                if webhook_enabled is not None:
                    updates.append("webhook_enabled = ?")
                    params.append(1 if webhook_enabled else 0)
                if notify_on_complete is not None:
                    updates.append("notify_on_complete = ?")
                    params.append(1 if notify_on_complete else 0)
                if notify_on_failure is not None:
                    updates.append("notify_on_failure = ?")
                    params.append(1 if notify_on_failure else 0)
                
                updates.append("updated_at = ?")
                params.append(now)
                params.append(user_id)
                
                await db.execute(
                    f"UPDATE notification_settings SET {', '.join(updates)} WHERE user_id = ?",
                    params,
                )
            else:
                # Insert new settings
                settings_id = str(uuid.uuid4())
                await db.execute(
                    """
                    INSERT INTO notification_settings 
                    (settings_id, user_id, webhook_url, webhook_enabled, 
                     notify_on_complete, notify_on_failure, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        settings_id,
                        user_id,
                        webhook_url if webhook_url else None,
                        1 if webhook_enabled else 0,
                        1 if (notify_on_complete is None or notify_on_complete) else 0,
                        1 if (notify_on_failure is None or notify_on_failure) else 0,
                        now,
                        now,
                    ),
                )
            
            await db.commit()
        
        return await self.get_settings(user_id)

    # =========================================================================
    # Webhook Delivery
    # =========================================================================

    async def send_webhook(
        self,
        user_id: str,
        webhook_url: str,
        payload: dict,
        event_type: str,
        run_id: Optional[str] = None,
    ) -> tuple[bool, Optional[int], Optional[str]]:
        """
        Send a webhook notification with retry logic.
        
        Args:
            user_id: User ID for logging
            webhook_url: URL to POST to
            payload: JSON payload to send
            event_type: Type of event (run_completed, run_failed, test)
            run_id: Optional run ID for logging
            
        Returns:
            Tuple of (success, status_code, error_message)
        """
        last_error = None
        last_status_code = None
        attempt_count = 0
        
        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT) as client:
            for attempt in range(MAX_RETRIES):
                attempt_count = attempt + 1
                try:
                    logger.info(
                        f"Webhook delivery attempt {attempt_count}/{MAX_RETRIES} "
                        f"to {webhook_url} for {event_type}"
                    )
                    
                    response = await client.post(
                        webhook_url,
                        json=payload,
                        headers={
                            "Content-Type": "application/json",
                            "User-Agent": "OpenBench-Studio/1.0",
                            "X-OpenBench-Event": event_type,
                        },
                    )
                    
                    last_status_code = response.status_code
                    
                    if response.is_success:
                        logger.info(
                            f"Webhook delivered successfully to {webhook_url} "
                            f"(status: {response.status_code})"
                        )
                        # Log success
                        await self._log_webhook(
                            user_id=user_id,
                            run_id=run_id,
                            event_type=event_type,
                            webhook_url=webhook_url,
                            status="success",
                            status_code=response.status_code,
                            attempt_count=attempt_count,
                            payload=payload,
                        )
                        return True, response.status_code, None
                    
                    # Non-success status code
                    last_error = f"HTTP {response.status_code}: {response.text[:200]}"
                    logger.warning(
                        f"Webhook delivery failed (attempt {attempt_count}): {last_error}"
                    )
                    
                except httpx.TimeoutException:
                    last_error = "Request timed out"
                    logger.warning(
                        f"Webhook delivery timeout (attempt {attempt_count})"
                    )
                except httpx.ConnectError as e:
                    last_error = f"Connection failed: {str(e)}"
                    logger.warning(
                        f"Webhook connection failed (attempt {attempt_count}): {e}"
                    )
                except Exception as e:
                    last_error = f"Unexpected error: {str(e)}"
                    logger.error(
                        f"Webhook delivery error (attempt {attempt_count}): {e}",
                        exc_info=True,
                    )
                
                # Wait before retry (except on last attempt)
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAYS[attempt]
                    logger.info(f"Retrying webhook in {delay}s...")
                    await asyncio.sleep(delay)
        
        # All retries failed
        logger.error(
            f"Webhook delivery failed after {MAX_RETRIES} attempts to {webhook_url}"
        )
        
        # Log failure
        await self._log_webhook(
            user_id=user_id,
            run_id=run_id,
            event_type=event_type,
            webhook_url=webhook_url,
            status="failed",
            status_code=last_status_code,
            error_message=last_error,
            attempt_count=attempt_count,
            payload=payload,
        )
        
        return False, last_status_code, last_error

    async def send_run_notification(
        self,
        user_id: str,
        run_id: str,
        benchmark: str,
        model: str,
        status: str,
        score: Optional[float] = None,
        duration_seconds: Optional[int] = None,
        error: Optional[str] = None,
    ) -> bool:
        """
        Send a notification for a completed/failed run if enabled.
        
        Returns True if notification was sent (or not needed), False on failure.
        """
        # Get user's notification settings
        settings = await self.get_settings(user_id)
        
        # Check if notifications are enabled
        if not settings.get("webhook_enabled"):
            logger.debug(f"Webhooks disabled for user {user_id}")
            return True
        
        webhook_url = settings.get("webhook_url")
        if not webhook_url:
            logger.debug(f"No webhook URL configured for user {user_id}")
            return True
        
        # Determine event type and check if user wants this notification
        if status == "completed":
            if not settings.get("notify_on_complete"):
                logger.debug(f"User {user_id} has notify_on_complete disabled")
                return True
            event_type = "run_completed"
        elif status == "failed":
            if not settings.get("notify_on_failure"):
                logger.debug(f"User {user_id} has notify_on_failure disabled")
                return True
            event_type = "run_failed"
        else:
            # Don't notify for other statuses (canceled, running, etc.)
            return True
        
        # Build payload
        payload = {
            "event": event_type,
            "run_id": run_id,
            "benchmark": benchmark,
            "model": model,
            "status": status,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        
        if score is not None:
            payload["score"] = round(score, 4)
        if duration_seconds is not None:
            payload["duration_seconds"] = duration_seconds
        if error:
            payload["error"] = error[:500]  # Truncate long errors
        
        # Send webhook
        success, _, _ = await self.send_webhook(
            user_id=user_id,
            webhook_url=webhook_url,
            payload=payload,
            event_type=event_type,
            run_id=run_id,
        )
        
        return success

    async def test_webhook(
        self,
        user_id: str,
        webhook_url: str,
    ) -> tuple[bool, Optional[int], Optional[str]]:
        """
        Send a test webhook to verify the URL is working.
        
        Returns (success, status_code, error_message).
        """
        payload = {
            "event": "test",
            "message": "This is a test notification from OpenBench Studio",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        
        return await self.send_webhook(
            user_id=user_id,
            webhook_url=webhook_url,
            payload=payload,
            event_type="test",
        )

    # =========================================================================
    # Logging
    # =========================================================================

    async def _log_webhook(
        self,
        user_id: str,
        event_type: str,
        webhook_url: str,
        status: str,
        attempt_count: int,
        run_id: Optional[str] = None,
        status_code: Optional[int] = None,
        error_message: Optional[str] = None,
        payload: Optional[dict] = None,
    ) -> None:
        """Log a webhook delivery attempt."""
        log_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        try:
            async with get_db() as db:
                await db.execute(
                    """
                    INSERT INTO webhook_logs 
                    (log_id, user_id, run_id, event_type, webhook_url, status,
                     status_code, error_message, attempt_count, payload_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        log_id,
                        user_id,
                        run_id,
                        event_type,
                        webhook_url,
                        status,
                        status_code,
                        error_message,
                        attempt_count,
                        json.dumps(payload) if payload else None,
                        now,
                    ),
                )
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to log webhook delivery: {e}")

    async def get_webhook_logs(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """Get recent webhook logs for a user."""
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT * FROM webhook_logs 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT ? OFFSET ?
                """,
                (user_id, limit, offset),
            )
            rows = await cursor.fetchall()
            
            return [
                {
                    "log_id": row["log_id"],
                    "run_id": row["run_id"],
                    "event_type": row["event_type"],
                    "status": row["status"],
                    "status_code": row["status_code"],
                    "error_message": row["error_message"],
                    "attempt_count": row["attempt_count"],
                    "created_at": row["created_at"],
                }
                for row in rows
            ]


# Global instance
notification_service = NotificationService()
