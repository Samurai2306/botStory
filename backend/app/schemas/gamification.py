from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class AchievementItemResponse(BaseModel):
    slug: str
    category: str
    name: str
    description: str
    icon_key: Optional[str] = None
    rarity: Optional[str] = None
    is_hidden: bool
    earned: bool
    earned_at: Optional[datetime] = None


class EquippedTitlesUpdate(BaseModel):
    slot1_title_id: Optional[int] = None
    slot2_title_id: Optional[int] = None


class EquippedTitleSlotResponse(BaseModel):
    slot: int
    title_id: Optional[int] = None
    slug: Optional[str] = None
    name: Optional[str] = None


class HeldTitleItem(BaseModel):
    title_id: int
    slug: str
    name: str


class TitleLeaderboardRow(BaseModel):
    title_id: int
    slug: str
    name: str
    description: str
    holder_user_id: Optional[int] = None
    holder_username: Optional[str] = None
    since_at: Optional[datetime] = None
    metric_value: Optional[Dict[str, Any]] = None


class PublicProfileAchievement(BaseModel):
    slug: str
    name: str
    description: str
    category: str
    earned_at: Optional[datetime] = None


class PublicProfileTitle(BaseModel):
    title_id: int
    slug: str
    name: str
    description: str
    is_current_holder: bool
    ever_held: bool


class PublicUserProfileResponse(BaseModel):
    id: int
    username: str
    canonical_username: Optional[str] = None
    bio: Optional[str] = None
    tagline: Optional[str] = None
    avatar_key: Optional[str] = None
    avatar_url: Optional[str] = None
    completed_levels: Optional[int] = None
    total_active_levels: Optional[int] = None
    progress_percent: Optional[int] = None
    achievements: List[PublicProfileAchievement]
    titles: List[PublicProfileTitle]
    equipped_titles: List[EquippedTitleSlotResponse]
