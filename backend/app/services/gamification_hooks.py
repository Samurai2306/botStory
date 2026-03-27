"""Call after commits that affect achievements or title leaderboards."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.achievement_service import run_checks_for_user
from app.services.title_service import recalculate_all_titles


def sync_gamification_for_users(db: Session, *user_ids: int | None) -> None:
    seen = {int(u) for u in user_ids if u is not None}
    for uid in seen:
        run_checks_for_user(db, uid)
    recalculate_all_titles(db)
    db.flush()
