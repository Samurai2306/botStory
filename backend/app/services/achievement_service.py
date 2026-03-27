"""Evaluate and grant achievements from DB definitions."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.db.models import (
    AchievementDefinition,
    CommunityComment,
    CommunityPost,
    CommunityPostLike,
    Level,
    LevelProgress,
    Message,
    UserAchievement,
)


def _cfg(cfg: Optional[Dict[str, Any]], key: str, default: Any = None) -> Any:
    if not cfg:
        return default
    return cfg.get(key, default)


def grant_achievement(
    db: Session, user_id: int, achievement_id: int, context: Optional[dict] = None
) -> bool:
    exists = (
        db.query(UserAchievement)
        .filter(
            UserAchievement.user_id == user_id,
            UserAchievement.achievement_id == achievement_id,
        )
        .first()
    )
    if exists:
        return False
    db.add(
        UserAchievement(
            user_id=user_id,
            achievement_id=achievement_id,
            earned_at=datetime.utcnow(),
            context=context,
        )
    )
    return True


def _count_likes_on_own_posts(db: Session, user_id: int) -> int:
    q = (
        db.query(func.count(CommunityPostLike.id))
        .join(CommunityPost, CommunityPostLike.post_id == CommunityPost.id)
        .filter(CommunityPost.author_id == user_id)
    )
    return int(q.scalar() or 0)


def _count_comments_on_others_posts(db: Session, user_id: int) -> int:
    q = (
        db.query(func.count(CommunityComment.id))
        .join(CommunityPost, CommunityComment.post_id == CommunityPost.id)
        .filter(
            CommunityComment.author_id == user_id,
            CommunityPost.author_id != user_id,
        )
    )
    return int(q.scalar() or 0)


def _count_level_chat_messages(db: Session, user_id: int) -> int:
    return int(
        db.query(func.count(Message.id))
        .filter(Message.user_id == user_id, Message.is_deleted == False)
        .scalar()
        or 0
    )


def _all_active_levels_difficulty_completed(db: Session, user_id: int, difficulty: int) -> bool:
    level_ids = [
        r[0]
        for r in db.query(Level.id)
        .filter(Level.is_active == True, Level.difficulty == difficulty)
        .all()
    ]
    if not level_ids:
        return False
    done = (
        db.query(func.count(distinct(LevelProgress.level_id)))
        .filter(
            LevelProgress.user_id == user_id,
            LevelProgress.completed == True,
            LevelProgress.level_id.in_(level_ids),
        )
        .scalar()
        or 0
    )
    return int(done) == len(level_ids)


def _beat_golden_distinct_count(db: Session, user_id: int) -> int:
    return int(
        db.query(func.count(distinct(LevelProgress.level_id)))
        .join(Level, LevelProgress.level_id == Level.id)
        .filter(
            LevelProgress.user_id == user_id,
            LevelProgress.completed == True,
            LevelProgress.best_steps_count.isnot(None),
            LevelProgress.best_steps_count < Level.golden_steps_count,
        )
        .scalar()
        or 0
    )


def _max_consecutive_no_loop_completed(db: Session, user_id: int) -> int:
    rows = (
        db.query(Level.id, Level.order)
        .filter(Level.is_active == True)
        .order_by(Level.order)
        .all()
    )
    if not rows:
        return 0
    prog_rows = (
        db.query(LevelProgress)
        .filter(
            LevelProgress.user_id == user_id,
            LevelProgress.completed == True,
            LevelProgress.completed_ever_without_loops == True,
        )
        .all()
    )
    ok_level_ids = {p.level_id for p in prog_rows}
    best = 0
    i = 0
    while i < len(rows):
        if rows[i][0] not in ok_level_ids:
            i += 1
            continue
        start_order = rows[i][1]
        length = 0
        j = i
        expected = start_order
        while j < len(rows) and rows[j][1] == expected and rows[j][0] in ok_level_ids:
            length += 1
            j += 1
            expected += 1
        best = max(best, length)
        i = j if j > i else i + 1
    return best


def _check_definition(db: Session, user_id: int, d: AchievementDefinition) -> bool:
    t = d.trigger_type
    cfg = d.trigger_config or {}

    if t == "community_likes_on_own_posts":
        return _count_likes_on_own_posts(db, user_id) >= int(_cfg(cfg, "min", 0))

    if t == "level_chat_messages":
        return _count_level_chat_messages(db, user_id) >= int(_cfg(cfg, "min", 0))

    if t == "community_comments_on_others_posts":
        return _count_comments_on_others_posts(db, user_id) >= int(_cfg(cfg, "min", 0))

    if t == "all_levels_difficulty_completed":
        return _all_active_levels_difficulty_completed(db, user_id, int(_cfg(cfg, "difficulty", 1)))

    if t == "beat_golden_once":
        exists = (
            db.query(LevelProgress.id)
            .join(Level, LevelProgress.level_id == Level.id)
            .filter(
                LevelProgress.user_id == user_id,
                LevelProgress.completed == True,
                LevelProgress.best_steps_count.isnot(None),
                LevelProgress.best_steps_count < Level.golden_steps_count,
            )
            .first()
        )
        return exists is not None

    if t == "beat_golden_distinct":
        return _beat_golden_distinct_count(db, user_id) >= int(_cfg(cfg, "min_distinct", 5))

    if t == "golden_parity":
        exists = (
            db.query(LevelProgress.id)
            .join(Level, LevelProgress.level_id == Level.id)
            .filter(
                LevelProgress.user_id == user_id,
                LevelProgress.completed == True,
                LevelProgress.best_steps_count == Level.golden_steps_count,
            )
            .first()
        )
        return exists is not None

    if t == "no_loop_hard_once":
        min_d = int(_cfg(cfg, "min_difficulty", 2))
        exists = (
            db.query(LevelProgress.id)
            .join(Level, LevelProgress.level_id == Level.id)
            .filter(
                LevelProgress.user_id == user_id,
                LevelProgress.completed == True,
                Level.difficulty >= min_d,
                LevelProgress.completed_ever_without_loops == True,
            )
            .first()
        )
        return exists is not None

    if t == "all_difficulties_no_loop":
        diffs = _cfg(cfg, "difficulties", [1, 2, 3])
        level_ids = [
            r[0]
            for r in db.query(Level.id)
            .filter(Level.is_active == True, Level.difficulty.in_(diffs))
            .all()
        ]
        if not level_ids:
            return False
        for lid in level_ids:
            p = (
                db.query(LevelProgress)
                .filter(
                    LevelProgress.user_id == user_id,
                    LevelProgress.level_id == lid,
                    LevelProgress.completed == True,
                    LevelProgress.completed_ever_without_loops == True,
                )
                .first()
            )
            if not p:
                return False
        return True

    if t == "consecutive_no_loop_streak":
        need = int(_cfg(cfg, "min_levels", 10))
        return _max_consecutive_no_loop_completed(db, user_id) >= need

    return False


def run_checks_for_user(db: Session, user_id: int) -> int:
    """Grant any newly earned achievements. Returns count of new grants."""
    defs = db.query(AchievementDefinition).all()
    granted = 0
    for d in defs:
        if not _check_definition(db, user_id, d):
            continue
        if grant_achievement(db, user_id, d.id):
            granted += 1
    if granted:
        db.flush()
    return granted
