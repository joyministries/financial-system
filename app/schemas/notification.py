from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    message: str
    category: str
    entity_type: str | None = None
    entity_id: str | None = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread: int
    page: int = 1
    page_size: int = 50
    total_pages: int = 1
    has_next_page: bool = False
    has_previous_page: bool = False


class UnreadCountResponse(BaseModel):
    count: int


class BroadcastNotificationCreate(BaseModel):
    """Admin sends a notification to all parents (in-app + push)."""
    title: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1, max_length=2000)


class BroadcastNotificationResponse(BaseModel):
    in_app_count: int
    push_sent: int
    push_failed: int


class NotificationHistoryItem(BaseModel):
    """A notification in the admin history view — includes recipient info."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    recipient_name: str | None = None
    recipient_email: str | None = None
    recipient_role: str | None = None
    title: str
    message: str
    category: str
    entity_type: str | None = None
    entity_id: str | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime


class NotificationHistoryResponse(BaseModel):
    items: list[NotificationHistoryItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next_page: bool = False
    has_previous_page: bool = False
