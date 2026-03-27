"""Transferable titles: recompute leaders and update holder state."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import desc, distinct, func
from sqlalchemy.orm import Session

from app.db.models import (
    CommunityComment,
    CommunityPost,
    CommunityPostLike,
    Level,
    LevelProgress,
    TitleDefinition,
    TitleHolderHistory,
    TitleHolderState,
    UserEquippedTitle,
)


def _total_active_levels(db: Session) -> int:
    return int(db.query(func.count(Level.id)).filter(Level.is_active == True).scalar() or 0)


def _boss_level_id(db: Session) -> Optional[int]:
    row = (
        db.query(Level.id)
        .filter(Level.is_active == True)
        .order_by(Level.order.desc(), Level.id.desc())
        .first()
    )
    return row[0] if row else None


def _winner_global_min_sum_best(db: Session) -> Tuple[Optional[int], Optional[dict]]:
    total = _total_active_levels(db)
    if total == 0:
        return None, None

    eligible_users = (
        db.query(LevelProgress.user_id)
        .join(Level, LevelProgress.level_id == Level.id)
        .filter(Level.is_active == True, LevelProgress.completed == True)
        .group_by(LevelProgress.user_id)
        .having(func.count(distinct(LevelProgress.level_id)) == total)
        .subquery()
    )

    row = (
        db.query(
            LevelProgress.user_id,
            func.sum(LevelProgress.best_steps_count).label("s"),
        )
        .join(Level, LevelProgress.level_id == Level.id)
        .filter(
            Level.is_active == True,
            LevelProgress.completed == True,
            LevelProgress.user_id.in_(db.query(eligible_users.c.user_id)),
            LevelProgress.best_steps_count.isnot(None),
        )
        .group_by(LevelProgress.user_id)
        .order_by(func.sum(LevelProgress.best_steps_count).asc(), LevelProgress.user_id.asc())
        .first()
    )
    if not row:
        return None, None
    uid, s = row[0], int(row[1])
    return uid, {"sum_best_steps": s, "levels_completed": total}


def _winner_min_best_on_level(db: Session, level_id: int) -> Tuple[Optional[int], Optional[dict]]:
    row = (
        db.query(LevelProgress.user_id, LevelProgress.best_steps_count)
        .filter(
            LevelProgress.level_id == level_id,
            LevelProgress.completed == True,
            LevelProgress.best_steps_count.isnot(None),
        )
        .order_by(LevelProgress.best_steps_count.asc(), LevelProgress.user_id.asc())
        .first()
    )
    if not row:
        return None, None
    return row[0], {"level_id": level_id, "best_steps": int(row[1])}


def _winner_min_sum_no_loop_diff_1_3(db: Session) -> Tuple[Optional[int], Optional[dict]]:
    level_ids = [
        r[0]
        for r in db.query(Level.id)
        .filter(Level.is_active == True, Level.difficulty.in_((1, 2, 3)))
        .all()
    ]
    if not level_ids:
        return None, None

    eligible = (
        db.query(LevelProgress.user_id)
        .filter(
            LevelProgress.completed == True,
            LevelProgress.completed_ever_without_loops == True,
            LevelProgress.level_id.in_(level_ids),
        )
        .group_by(LevelProgress.user_id)
        .having(func.count(distinct(LevelProgress.level_id)) == len(level_ids))
        .subquery()
    )

    row = (
        db.query(
            LevelProgress.user_id,
            func.sum(LevelProgress.best_steps_count).label("s"),
        )
        .join(Level, LevelProgress.level_id == Level.id)
        .filter(
            Level.is_active == True,
            Level.difficulty.in_((1, 2, 3)),
            LevelProgress.completed == True,
            LevelProgress.completed_ever_without_loops == True,
            LevelProgress.user_id.in_(db.query(eligible.c.user_id)),
            LevelProgress.best_steps_count.isnot(None),
        )
        .group_by(LevelProgress.user_id)
        .order_by(func.sum(LevelProgress.best_steps_count).asc(), LevelProgress.user_id.asc())
        .first()
    )
    if not row:
        return None, None
    return row[0], {"sum_best_steps_diff_1_3": int(row[1])}


def _winner_max_likes_window(db: Session, days: int) -> Tuple[Optional[int], Optional[dict]]:
    since = datetime.utcnow() - timedelta(days=days)
    like_cnt = func.count(CommunityPostLike.id).label("like_cnt")
    row = (
        db.query(CommunityPost.author_id, like_cnt)
        .join(CommunityPostLike, CommunityPostLike.post_id == CommunityPost.id)
        .filter(CommunityPostLike.created_at >= since)
        .group_by(CommunityPost.author_id)
        .order_by(desc(like_cnt), CommunityPost.author_id.asc())
        .first()
    )
    if not row:
        return None, None
    return int(row[0]), {"likes": int(row[1]), "window_days": days}


def _winner_max_comments_window(db: Session, days: int) -> Tuple[Optional[int], Optional[dict]]:
    since = datetime.utcnow() - timedelta(days=days)
    comment_cnt = func.count(CommunityComment.id).label("comment_cnt")
    row = (
        db.query(CommunityComment.author_id, comment_cnt)
        .filter(CommunityComment.created_at >= since)
        .group_by(CommunityComment.author_id)
        .order_by(desc(comment_cnt), CommunityComment.author_id.asc())
        .first()
    )
    if not row:
        return None, None
    return int(row[0]), {"comments": int(row[1]), "window_days": days}


def _apply_holder_change(
    db: Session,
    title_id: int,
    new_holder_id: Optional[int],
    metric_value: Optional[dict],
    reason: str,
) -> None:
    state = (
        db.query(TitleHolderState)
        .filter(TitleHolderState.title_id == title_id)
        .with_for_update()
        .first()
    )
    if not state:
        state = TitleHolderState(title_id=title_id)
        db.add(state)
        db.flush()
        state = (
            db.query(TitleHolderState)
            .filter(TitleHolderState.title_id == title_id)
            .with_for_update()
            .one()
        )

    old = state.holder_user_id
    if old == new_holder_id:
        state.metric_value = metric_value
        state.since_at = state.since_at or datetime.utcnow()
        return

    if old is not None:
        db.query(UserEquippedTitle).filter(
            UserEquippedTitle.user_id == old,
            UserEquippedTitle.title_id == title_id,
        ).delete(synchronize_session=False)

    state.holder_user_id = new_holder_id
    state.since_at = datetime.utcnow()
    state.metric_value = metric_value

    if new_holder_id is not None:
        db.add(
            TitleHolderHistory(
                title_id=title_id,
                from_user_id=old,
                to_user_id=new_holder_id,
                changed_at=datetime.utcnow(),
                reason=reason,
                metric_value=metric_value,
            )
        )


def recalculate_title(db: Session, title: TitleDefinition) -> None:
    metric = title.leader_metric
    cfg = title.metric_config or {}

    winner_id: Optional[int] = None
    metric_val: Optional[dict] = None

    if metric == "global_min_sum_best_steps_all_completed":
        winner_id, metric_val = _winner_global_min_sum_best(db)
    elif metric == "min_best_steps_on_boss_level":
        boss = _boss_level_id(db)
        if boss is not None:
            winner_id, metric_val = _winner_min_best_on_level(db, boss)
    elif metric == "min_sum_best_no_loop_diff_1_3":
        winner_id, metric_val = _winner_min_sum_no_loop_diff_1_3(db)
    elif metric == "max_post_likes_window_days":
        days = int(cfg.get("days", 30))
        winner_id, metric_val = _winner_max_likes_window(db, days)
    elif metric == "max_comments_window_days":
        days = int(cfg.get("days", 30))
        winner_id, metric_val = _winner_max_comments_window(db, days)

    _apply_holder_change(db, title.id, winner_id, metric_val, reason="recalc")


def recalculate_all_titles(db: Session) -> None:
    titles = db.query(TitleDefinition).all()
    for t in titles:
        recalculate_title(db, t)
