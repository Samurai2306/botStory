from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field

from app.db.models import UpdateStatus


TimelineEventType = Literal["feature", "fix", "improvement", "design", "infra", "other"]
LayoutBlockType = Literal["hero", "rich_text", "timeline_slice", "media", "cta"]
TimelineStyleType = Literal["neon", "glass", "minimal", "retro"]


class TimelineEvent(BaseModel):
    date: datetime
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(min_length=1, max_length=1000)
    type: TimelineEventType = "feature"


class ThemeConfig(BaseModel):
    accent_color: str = "#8B7ED8"
    secondary_color: str = "#B8A9E8"
    background_gradient: str = "linear-gradient(135deg,#151127,#211a3b,#151127)"
    icon: str = "◉"
    timeline_style: TimelineStyleType = "neon"
    surface_pattern: Optional[str] = None


class LayoutBlock(BaseModel):
    type: LayoutBlockType
    title: Optional[str] = Field(default=None, max_length=140)
    content: Optional[str] = Field(default=None, max_length=6000)
    media_url: Optional[str] = Field(default=None, max_length=500)
    cta_text: Optional[str] = Field(default=None, max_length=80)
    cta_url: Optional[str] = Field(default=None, max_length=500)
    emphasized: bool = False


class UpdateBase(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    summary: Optional[str] = Field(default=None, max_length=420)
    content: str = Field(min_length=1, max_length=12000)
    topic: str = Field(default="general", min_length=1, max_length=60)
    status: UpdateStatus = UpdateStatus.DRAFT
    is_published: bool = False
    is_pinned: bool = False
    published_at: Optional[datetime] = None
    timeline_events: List[TimelineEvent] = Field(default_factory=list)
    theme_config: ThemeConfig = Field(default_factory=ThemeConfig)
    layout_blocks: List[LayoutBlock] = Field(default_factory=list)


class UpdateCreate(UpdateBase):
    pass


class UpdateUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=180)
    summary: Optional[str] = Field(default=None, max_length=420)
    content: Optional[str] = Field(default=None, min_length=1, max_length=12000)
    topic: Optional[str] = Field(default=None, min_length=1, max_length=60)
    status: Optional[UpdateStatus] = None
    is_published: Optional[bool] = None
    is_pinned: Optional[bool] = None
    published_at: Optional[datetime] = None
    timeline_events: Optional[List[TimelineEvent]] = None
    theme_config: Optional[ThemeConfig] = None
    layout_blocks: Optional[List[LayoutBlock]] = None


class UpdateResponse(UpdateBase):
    id: int
    author_id: int
    author_username: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
