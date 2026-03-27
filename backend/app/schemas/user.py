from pydantic import BaseModel, EmailStr, Field
from typing import Any, Dict, Optional
from datetime import datetime
from app.db.models import UserRole


class UserBase(BaseModel):
    email: EmailStr
    username: str


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    hint_word: Optional[str] = None
    locale: Optional[str] = None
    terminal_theme: Optional[str] = None
    bio: Optional[str] = Field(None, max_length=500)
    tagline: Optional[str] = Field(None, max_length=120)
    profile_preferences: Optional[Dict[str, Any]] = None


class UserResponse(UserBase):
    id: int
    role: UserRole
    is_active: bool
    created_at: datetime
    hint_word: Optional[str] = None
    locale: Optional[str] = None
    terminal_theme: Optional[str] = None
    bio: Optional[str] = None
    tagline: Optional[str] = None
    profile_preferences: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[UserRole] = None


def build_user_response(user: Any) -> UserResponse:
    from app.profile_prefs import merged_preferences

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        hint_word=user.hint_word,
        locale=user.locale,
        terminal_theme=user.terminal_theme,
        bio=user.bio,
        tagline=user.tagline,
        profile_preferences=merged_preferences(user.profile_preferences),
    )
