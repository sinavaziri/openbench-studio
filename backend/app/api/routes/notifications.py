"""
Notification settings and webhook management routes.

Handles webhook configuration and testing.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
import re

from app.core.auth import get_current_user
from app.db.models import User
from app.services.notifications import notification_service

router = APIRouter()


class NotificationSettingsResponse(BaseModel):
    """Notification settings for a user."""
    webhook_url: Optional[str] = Field(None, description="Webhook URL for notifications")
    webhook_enabled: bool = Field(default=False, description="Whether webhook notifications are enabled")
    notify_on_complete: bool = Field(default=True, description="Notify when run completes")
    notify_on_failure: bool = Field(default=True, description="Notify when run fails")


class NotificationSettingsUpdate(BaseModel):
    """Request to update notification settings."""
    webhook_url: Optional[str] = Field(None, description="Webhook URL (must be https)")
    webhook_enabled: Optional[bool] = Field(None, description="Enable/disable webhooks")
    notify_on_complete: Optional[bool] = Field(None, description="Notify on completion")
    notify_on_failure: Optional[bool] = Field(None, description="Notify on failure")

    @field_validator('webhook_url')
    @classmethod
    def validate_webhook_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        # Basic URL validation - must be https or http for local testing
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain
            r'localhost|'  # localhost
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or IP
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE
        )
        if not url_pattern.match(v):
            raise ValueError('Invalid webhook URL. Must be a valid HTTP(S) URL.')
        return v


class WebhookTestRequest(BaseModel):
    """Request to test a webhook URL."""
    webhook_url: str = Field(..., description="Webhook URL to test")

    @field_validator('webhook_url')
    @classmethod
    def validate_webhook_url(cls, v: str) -> str:
        url_pattern = re.compile(
            r'^https?://'
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'
            r'localhost|'
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'
            r'(?::\d+)?'
            r'(?:/?|[/?]\S+)$', re.IGNORECASE
        )
        if not url_pattern.match(v):
            raise ValueError('Invalid webhook URL. Must be a valid HTTP(S) URL.')
        return v


class WebhookTestResponse(BaseModel):
    """Response from testing a webhook."""
    success: bool = Field(..., description="Whether the webhook was successfully delivered")
    status_code: Optional[int] = Field(None, description="HTTP status code from webhook")
    message: str = Field(..., description="Result message")


class WebhookLogEntry(BaseModel):
    """A webhook delivery log entry."""
    log_id: str
    run_id: Optional[str]
    event_type: str
    status: str
    status_code: Optional[int]
    error_message: Optional[str]
    attempt_count: int
    created_at: str


@router.get(
    "/notifications/settings",
    response_model=NotificationSettingsResponse,
    summary="Get notification settings",
    description="Get current notification settings for the authenticated user.",
    responses={
        200: {
            "description": "Current notification settings",
            "content": {
                "application/json": {
                    "example": {
                        "webhook_url": "https://hooks.example.com/webhook",
                        "webhook_enabled": True,
                        "notify_on_complete": True,
                        "notify_on_failure": True,
                    }
                }
            }
        },
        401: {"description": "Not authenticated"},
    }
)
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
):
    """
    Get notification settings for the current user.
    
    **Requires authentication.**
    """
    settings = await notification_service.get_settings(current_user.user_id)
    return NotificationSettingsResponse(**settings)


@router.patch(
    "/notifications/settings",
    response_model=NotificationSettingsResponse,
    summary="Update notification settings",
    description="Update notification settings for the authenticated user.",
    responses={
        200: {
            "description": "Updated notification settings",
        },
        401: {"description": "Not authenticated"},
        422: {"description": "Invalid webhook URL"},
    }
)
async def update_notification_settings(
    update: NotificationSettingsUpdate,
    current_user: User = Depends(get_current_user),
):
    """
    Update notification settings.
    
    Only provided fields will be updated.
    
    **Requires authentication.**
    """
    settings = await notification_service.update_settings(
        user_id=current_user.user_id,
        webhook_url=update.webhook_url,
        webhook_enabled=update.webhook_enabled,
        notify_on_complete=update.notify_on_complete,
        notify_on_failure=update.notify_on_failure,
    )
    return NotificationSettingsResponse(**settings)


@router.post(
    "/notifications/test-webhook",
    response_model=WebhookTestResponse,
    summary="Test webhook URL",
    description="Send a test payload to a webhook URL to verify it's working.",
    responses={
        200: {
            "description": "Test result",
            "content": {
                "application/json": {
                    "examples": {
                        "success": {
                            "value": {
                                "success": True,
                                "status_code": 200,
                                "message": "Webhook delivered successfully",
                            }
                        },
                        "failure": {
                            "value": {
                                "success": False,
                                "status_code": 404,
                                "message": "Webhook delivery failed: HTTP 404",
                            }
                        }
                    }
                }
            }
        },
        401: {"description": "Not authenticated"},
        422: {"description": "Invalid webhook URL"},
    }
)
async def test_webhook(
    request: WebhookTestRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Send a test notification to a webhook URL.
    
    This sends a test payload with `event: "test"` to verify the webhook is working.
    The test uses the same retry logic as real notifications (3 attempts with backoff).
    
    **Requires authentication.**
    """
    success, status_code, error = await notification_service.test_webhook(
        user_id=current_user.user_id,
        webhook_url=request.webhook_url,
    )
    
    if success:
        message = f"Webhook delivered successfully (status: {status_code})"
    else:
        message = f"Webhook delivery failed after 3 attempts"
        if error:
            message = f"{message}: {error}"
    
    return WebhookTestResponse(
        success=success,
        status_code=status_code,
        message=message,
    )


@router.get(
    "/notifications/logs",
    response_model=list[WebhookLogEntry],
    summary="Get webhook delivery logs",
    description="Get recent webhook delivery logs for the authenticated user.",
    responses={
        200: {
            "description": "List of webhook delivery logs",
        },
        401: {"description": "Not authenticated"},
    }
)
async def get_webhook_logs(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
):
    """
    Get recent webhook delivery logs.
    
    Shows both successful and failed webhook deliveries.
    
    **Requires authentication.**
    """
    logs = await notification_service.get_webhook_logs(
        user_id=current_user.user_id,
        limit=min(limit, 100),
        offset=offset,
    )
    return [WebhookLogEntry(**log) for log in logs]
