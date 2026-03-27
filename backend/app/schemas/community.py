from pydantic import BaseModel
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
    liked_by_me: bool = False

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
    parent_username: Optional[str] = None  # кому отвечаем

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
    options: List[PollOptionResponse]
    total_votes: int = 0
    voted_by_me: bool = False
    my_option_id: Optional[int] = None

    class Config:
        from_attributes = True


class PollVoteCreate(BaseModel):
    option_id: int
