from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import (
    User,
    Level,
    LevelProgress,
    UserAchievement,
    AchievementDefinition,
    TitleDefinition,
    TitleHolderState,
    TitleHolderHistory,
    UserEquippedTitle,
)
from app.schemas.user import UserResponse, UserUpdate, build_user_response
from app.schemas.user import UserSearchItem
from app.core.deps import get_current_user, get_current_admin
from app.core.security import get_password_hash
from app.core.config import settings
from app.schemas.gamification import (
    PublicUserProfileResponse,
    PublicProfileAchievement,
    PublicProfileTitle,
    EquippedTitleSlotResponse,
)
from app.profile_prefs import merged_preferences, apply_preferences_patch
from app.avatar_catalog import avatar_catalog, is_valid_avatar_key, render_avatar_svg

router = APIRouter()


def _search_users_query(
    db: Session,
    q: str,
    limit: int,
    exclude_user_id: int | None = None,
):
    needle = f"%{q.strip()}%"
    query = db.query(User).filter(User.username.ilike(needle))
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.limit(limit).all()


def _avatar_url_for(key: str | None) -> str | None:
    return f"/api/v1/users/avatars/{key}.svg" if key else None


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
    return build_user_response(current_user)


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

    if "bio" in update_data:
        val = update_data["bio"]
        if val is None or (isinstance(val, str) and not val.strip()):
            current_user.bio = None
        else:
            s = val.strip() if isinstance(val, str) else str(val)
            if len(s) > 500:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bio must be at most 500 characters",
                )
            current_user.bio = s

    if "tagline" in update_data:
        val = update_data["tagline"]
        if val is None or (isinstance(val, str) and not val.strip()):
            current_user.tagline = None
        else:
            s = val.strip() if isinstance(val, str) else str(val)
            if len(s) > 120:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tagline must be at most 120 characters",
                )
            current_user.tagline = s

    if "avatar_key" in update_data:
        val = update_data["avatar_key"]
        if val is None or (isinstance(val, str) and not val.strip()):
            current_user.avatar_key = None
        else:
            s = val.strip() if isinstance(val, str) else str(val)
            if not is_valid_avatar_key(s):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid avatar_key")
            current_user.avatar_key = s

    if "profile_preferences" in update_data and update_data["profile_preferences"] is not None:
        patch = update_data["profile_preferences"]
        if not isinstance(patch, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="profile_preferences must be an object",
            )
        current_user.profile_preferences = apply_preferences_patch(
            current_user.profile_preferences, patch
        )

    db.commit()
    db.refresh(current_user)

    return build_user_response(current_user)


def _user_ever_held_title(db: Session, user_id: int, title_id: int) -> bool:
    st = (
        db.query(TitleHolderState)
        .filter(
            TitleHolderState.title_id == title_id,
            TitleHolderState.holder_user_id == user_id,
        )
        .first()
    )
    if st:
        return True
    h = (
        db.query(TitleHolderHistory)
        .filter(
            TitleHolderHistory.title_id == title_id,
            or_(
                TitleHolderHistory.to_user_id == user_id,
                TitleHolderHistory.from_user_id == user_id,
            ),
        )
        .first()
    )
    return h is not None


def _build_public_profile_response(user: User, db: Session) -> PublicUserProfileResponse:
    prefs = merged_preferences(user.profile_preferences)
    priv = prefs.get("privacy") or {}
    hide_stats = bool(priv.get("hide_stats_on_public"))
    hide_ach = bool(priv.get("hide_achievements_on_public"))
    hide_bio = bool(priv.get("hide_bio_on_public"))
    hide_tagline = bool(priv.get("hide_tagline_on_public"))

    total = db.query(Level).filter(Level.is_active == True).count()
    completed = (
        db.query(LevelProgress)
        .filter(LevelProgress.user_id == user.id, LevelProgress.completed == True)
        .count()
    )
    progress_pct = round((completed / total) * 100) if total and not hide_stats else None

    earned_rows = (
        db.query(UserAchievement, AchievementDefinition)
        .join(AchievementDefinition, UserAchievement.achievement_id == AchievementDefinition.id)
        .filter(UserAchievement.user_id == user.id)
        .order_by(UserAchievement.earned_at.desc())
        .all()
    )
    achievements_out = (
        []
        if hide_ach
        else [
            PublicProfileAchievement(
                slug=ad.slug,
                name=ad.name,
                description=ad.description,
                category=ad.category,
                earned_at=ua.earned_at,
            )
            for ua, ad in earned_rows
        ]
    )
    titles_rows = db.query(TitleDefinition).order_by(TitleDefinition.id).all()
    titles_out: List[PublicProfileTitle] = []
    for td in titles_rows:
        st = db.query(TitleHolderState).filter(TitleHolderState.title_id == td.id).first()
        holder_id = st.holder_user_id if st else None
        titles_out.append(
            PublicProfileTitle(
                title_id=td.id,
                slug=td.slug,
                name=td.name,
                description=td.description,
                is_current_holder=(holder_id == user.id),
                ever_held=_user_ever_held_title(db, user.id, td.id),
            )
        )
    eq_rows = (
        db.query(UserEquippedTitle, TitleDefinition)
        .join(TitleDefinition, UserEquippedTitle.title_id == TitleDefinition.id)
        .filter(UserEquippedTitle.user_id == user.id)
        .order_by(UserEquippedTitle.slot)
        .all()
    )
    by_slot = {r[0].slot: (r[0], r[1]) for r in eq_rows}
    equipped: List[EquippedTitleSlotResponse] = []
    for slot in (1, 2):
        if slot in by_slot:
            _, td = by_slot[slot]
            equipped.append(
                EquippedTitleSlotResponse(slot=slot, title_id=td.id, slug=td.slug, name=td.name)
            )
        else:
            equipped.append(EquippedTitleSlotResponse(slot=slot, title_id=None, slug=None, name=None))
    return PublicUserProfileResponse(
        id=user.id,
        username=user.username,
        canonical_username=user.username,
        bio=None if hide_bio else (user.bio or None) if (user.bio and str(user.bio).strip()) else None,
        tagline=None if hide_tagline else (user.tagline or None) if (user.tagline and str(user.tagline).strip()) else None,
        avatar_key=user.avatar_key,
        avatar_url=_avatar_url_for(user.avatar_key),
        completed_levels=None if hide_stats else completed,
        total_active_levels=None if hide_stats else total,
        progress_percent=None if hide_stats else progress_pct,
        achievements=achievements_out,
        titles=titles_out,
        equipped_titles=equipped,
    )


@router.get("/avatars/catalog")
async def get_avatars_catalog():
    return avatar_catalog()


@router.get("/avatars/{avatar_key}.svg")
async def get_avatar_svg(avatar_key: str):
    if not is_valid_avatar_key(avatar_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    return Response(content=render_avatar_svg(avatar_key), media_type="image/svg+xml")


@router.get("/by-id/{user_id}/public", response_model=PublicUserProfileResponse)
async def get_public_profile_by_id(
    user_id: int,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _build_public_profile_response(user, db)


@router.get("/search", response_model=List[UserSearchItem])
async def search_users(
    q: str,
    limit: int = Query(20, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    exclude_user_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    users = _search_users_query(db, q=q, limit=limit, exclude_user_id=exclude_user_id)
    if not users:
        return []
    out: List[UserSearchItem] = []
    for u in users:
        rows = (
            db.query(TitleDefinition.name)
            .join(UserEquippedTitle, UserEquippedTitle.title_id == TitleDefinition.id)
            .filter(UserEquippedTitle.user_id == u.id)
            .all()
        )
        out.append(
            UserSearchItem(
                id=u.id,
                username=u.username,
                avatar_url=_avatar_url_for(u.avatar_key),
                matched_titles=[r[0] for r in rows],
            )
        )
    return out


@router.get("/{username}/public", response_model=PublicUserProfileResponse)
async def get_public_profile(
    username: str,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _build_public_profile_response(user, db)


@router.get("/", response_model=List[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(settings.PAGINATION_DEFAULT_LIMIT, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all users (admin only)"""
    users = db.query(User).offset(skip).limit(limit).all()
    return [build_user_response(u) for u in users]
