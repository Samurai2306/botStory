from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import User, Level, LevelProgress
from app.schemas.user import UserResponse, UserUpdate
from app.core.deps import get_current_user, get_current_admin
from app.core.security import get_password_hash

router = APIRouter()


class UserStatsResponse(BaseModel):
    completed: int
    total: int
    progress_percent: int


class LevelProgressItem(BaseModel):
    level_id: int
    completed: bool
    best_steps_count: int | None = None


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_current_user_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user progress stats (completed levels count)"""
    total = db.query(Level).filter(Level.is_active == True).count()
    completed = db.query(LevelProgress).filter(
        LevelProgress.user_id == current_user.id,
        LevelProgress.completed == True
    ).count()
    progress_percent = round((completed / total) * 100) if total else 0
    return UserStatsResponse(completed=completed, total=total, progress_percent=progress_percent)


@router.get("/me/progress", response_model=List[LevelProgressItem])
async def get_current_user_level_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get completion status for each level (for LevelHub filters and badges)"""
    rows = db.query(
        LevelProgress.level_id,
        LevelProgress.completed,
        LevelProgress.best_steps_count,
    ).filter(
        LevelProgress.user_id == current_user.id
    ).all()
    return [
        LevelProgressItem(
            level_id=r.level_id,
            completed=r.completed,
            best_steps_count=r.best_steps_count,
        )
        for r in rows
    ]


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user profile"""
    update_data = user_update.dict(exclude_unset=True)
    
    if "email" in update_data:
        # Check if email is already taken
        existing = db.query(User).filter(
            User.email == update_data["email"],
            User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        current_user.email = update_data["email"]
    
    if "username" in update_data:
        # Check if username is already taken
        existing = db.query(User).filter(
            User.username == update_data["username"],
            User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.username = update_data["username"]
    
    if "password" in update_data:
        current_user.password_hash = get_password_hash(update_data["password"])

    if "hint_word" in update_data:
        val = update_data["hint_word"]
        current_user.hint_word = (val.strip() if isinstance(val, str) else None) or None

    if "locale" in update_data:
        val = update_data["locale"]
        if val is None:
            pass
        elif val not in ("ru", "en"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid locale")
        else:
            current_user.locale = val

    if "terminal_theme" in update_data:
        val = update_data["terminal_theme"]
        if val is None:
            pass
        elif val not in ("windows", "macos", "linux"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid terminal theme")
        else:
            current_user.terminal_theme = val

    db.commit()
    db.refresh(current_user)
    
    return current_user


@router.get("/", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all users (admin only)"""
    users = db.query(User).offset(skip).limit(limit).all()
    return users
