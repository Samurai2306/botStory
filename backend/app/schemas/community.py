import enum

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.db.models import PostCategory


class PostBase(BaseModel):
    title: str
    content: str
    category: PostCategory = PostCategory.DISCUSSION


class PostCreate(PostBase):
    pass


class PostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[PostCategory] = None
    pinned: Optional[bool] = None


class PostResponse(PostBase):
    id: int
    author_id: int
    pinned: bool
    created_at: datetime
    updated_at: datetime
    likes_count: int = 0
    comments_count: int = 0
    author_username: Optional[str] = None
    author_avatar_url: Optional[str] = None
    liked_by_me: bool = False
    bookmarked_by_me: bool = False

    class Config:
        from_attributes = True


class CommentBase(BaseModel):
    content: str


class CommentCreate(CommentBase):
    parent_id: Optional[int] = None  # ответ на комментарий с этим id


class CommentResponse(CommentBase):
    id: int
    post_id: int
    author_id: int
    parent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    author_username: Optional[str] = None
    author_avatar_url: Optional[str] = None
    parent_username: Optional[str] = None  # кому отвечаем
    parent_avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


# ---- Опросы ----
class PollOptionCreate(BaseModel):
    text: str


class PollOptionResponse(BaseModel):
    id: int
    poll_id: int
    text: str
    order: int
    votes_count: int = 0
    voted_by_me: bool = False

    class Config:
        from_attributes = True


class PollCreate(BaseModel):
    title: str
    description: Optional[str] = None
    options: List[PollOptionCreate]  # минимум 2 варианта


class PollResponse(BaseModel):
    id: int
    author_id: int
    title: str
    description: Optional[str] = None
    closed: bool
    created_at: datetime
    updated_at: datetime
    author_username: Optional[str] = None
    author_avatar_url: Optional[str] = None
    options: List[PollOptionResponse]
    total_votes: int = 0
    voted_by_me: bool = False
    my_option_id: Optional[int] = None

    class Config:
        from_attributes = True


class PollVoteCreate(BaseModel):
    option_id: int


class PollStateUpdate(BaseModel):
    closed: bool


class MentionResponse(BaseModel):
    id: int
    target_type: str
    target_id: int
    target_user_id: int
    author_user_id: int
    author_username: Optional[str] = None
    created_at: datetime
    is_read: bool = False


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str] = None
    payload: Optional[dict] = None
    is_read: bool = False
    is_pinned: bool = False
    created_at: datetime


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int = 0


class NotificationPinBody(BaseModel):
    pinned: bool


class NotificationBroadcastTheme(str, enum.Enum):
    SYSTEM = "system"
    IMPORTANT_UPDATE = "important_update"
    MAINTENANCE = "maintenance"
    COMMUNITY = "community"
    GENERAL = "general"


class NotificationBroadcastCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    body: Optional[str] = Field(default=None, max_length=500)
    theme: NotificationBroadcastTheme = NotificationBroadcastTheme.GENERAL


class NotificationBroadcastResult(BaseModel):
    recipients: int


class BookmarkResponse(BaseModel):
    post_id: int
    created_at: datetime


class CategorySubscriptionResponse(BaseModel):
    category: PostCategory
    created_at: datetime


class ReputationLeaderboardRow(BaseModel):
    user_id: int
    username: str
    avatar_url: Optional[str] = None
    reputation_score: int


class CommunityUserCard(BaseModel):
    user_id: int
    username: str
    avatar_url: Optional[str] = None
    reputation_score: int = 0
    is_friend: bool = False
