from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.db.models import (
    AchievementDefinition,
    TitleDefinition,
    TitleHolderState,
    User,
    UserAchievement,
    UserEquippedTitle,
)
from app.schemas.gamification import (
    AchievementItemResponse,
    EquippedTitleSlotResponse,
    EquippedTitlesUpdate,
)
from app.core.deps import get_current_user

router = APIRouter()


@router.get("/achievements", response_model=List[AchievementItemResponse])
async def get_my_achievements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    defs = db.query(AchievementDefinition).order_by(AchievementDefinition.id).all()
    earned_map = {
        row.achievement_id: row
        for row in db.query(UserAchievement)
        .filter(UserAchievement.user_id == current_user.id)
        .all()
    }
    out: List[AchievementItemResponse] = []
    for d in defs:
        if d.is_hidden and d.id not in earned_map:
            continue
        ua = earned_map.get(d.id)
        out.append(
            AchievementItemResponse(
                slug=d.slug,
                category=d.category,
                name=d.name,
                description=d.description,
                icon_key=d.icon_key,
                rarity=d.rarity,
                is_hidden=d.is_hidden,
                earned=ua is not None,
                earned_at=ua.earned_at if ua else None,
            )
        )
    return out


def _equipped_slots(db: Session, user_id: int) -> List[EquippedTitleSlotResponse]:
    rows = (
        db.query(UserEquippedTitle, TitleDefinition)
        .join(TitleDefinition, UserEquippedTitle.title_id == TitleDefinition.id)
        .filter(UserEquippedTitle.user_id == user_id)
        .order_by(UserEquippedTitle.slot)
        .all()
    )
    by_slot = {r[0].slot: (r[0], r[1]) for r in rows}
    result: List[EquippedTitleSlotResponse] = []
    for slot in (1, 2):
        if slot in by_slot:
            eq, td = by_slot[slot]
            result.append(
                EquippedTitleSlotResponse(
                    slot=slot,
                    title_id=td.id,
                    slug=td.slug,
                    name=td.name,
                )
            )
        else:
            result.append(EquippedTitleSlotResponse(slot=slot, title_id=None, slug=None, name=None))
    return result


@router.get("/equipped-titles", response_model=List[EquippedTitleSlotResponse])
async def get_my_equipped_titles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _equipped_slots(db, current_user.id)


@router.put("/equipped-titles", response_model=List[EquippedTitleSlotResponse])
async def set_my_equipped_titles(
    body: EquippedTitlesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    slots = {
        1: body.slot1_title_id,
        2: body.slot2_title_id,
    }
    non_null = [t for t in slots.values() if t is not None]
    if len(non_null) != len(set(non_null)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Same title cannot be equipped in two slots",
        )
    for slot, title_id in slots.items():
        if title_id is None:
            continue
        st = (
            db.query(TitleHolderState)
            .filter(
                TitleHolderState.title_id == title_id,
                TitleHolderState.holder_user_id == current_user.id,
            )
            .first()
        )
        if not st:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You are not the current holder of title {title_id}",
            )

    db.query(UserEquippedTitle).filter(UserEquippedTitle.user_id == current_user.id).delete(
        synchronize_session=False
    )
    for slot, title_id in slots.items():
        if title_id is not None:
            db.add(
                UserEquippedTitle(
                    user_id=current_user.id,
                    slot=slot,
                    title_id=title_id,
                )
            )
    db.commit()
    return _equipped_slots(db, current_user.id)
