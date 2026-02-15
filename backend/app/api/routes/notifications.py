"""
Notification settings and history routes.

Handles email and webhook notification configuration.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, EmailStr

from app.core.auth import get_current_user
from app.db.models import User

router = APIRouter()


class NotificationSettings(BaseModel):
    """Notification settings for a user."""
    email_enabled: bool = Field(default=False, description="Whether email notifications are enabled")
    email_address: Optional[EmailStr] = Field(None, description="Email address for notifications")
    webhook_enabled: bool = Field(default=False, description="Whether webhook notifications are enabled")
    webhook_url: Optional[str] = Field(None, description="Webhook URL for notifications")
    notify_on_complete: bool = Field(default=True, description="Notify when run completes")
    notify_on_fail: bool = Field(default=True, description="Notify when run fails")


@router.get(
    "/notifications/settings",
    response_model=NotificationSettings,
    summary="Get notification settings",
    description="Get current notification settings for the authenticated user.",
)
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
):
    """
    Get notification settings for the current user.
    
    **Requires authentication.**
    """
    # TODO: Implement actual settings storage
    return NotificationSettings()


@router.put(
    "/notifications/settings",
    response_model=NotificationSettings,
    summary="Update notification settings",
    description="Update notification settings for the authenticated user.",
)
async def update_notification_settings(
    settings: NotificationSettings,
    current_user: User = Depends(get_current_user),
):
    """
    Update notification settings.
    
    **Requires authentication.**
    """
    # TODO: Implement actual settings storage
    return settings
