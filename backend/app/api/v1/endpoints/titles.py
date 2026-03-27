from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.db.models import TitleDefinition, TitleHolderState, User
from app.schemas.gamification import TitleLeaderboardRow

router = APIRouter()


@router.get("/leaderboard", response_model=List[TitleLeaderboardRow])
async def titles_leaderboard(db: Session = Depends(get_db)):
    rows = db.query(TitleDefinition).order_by(TitleDefinition.id).all()
    out: List[TitleLeaderboardRow] = []
    for td in rows:
        st = db.query(TitleHolderState).filter(TitleHolderState.title_id == td.id).first()
        holder_username = None
        holder_id = None
        since_at = None
        metric_value = None
        if st:
            holder_id = st.holder_user_id
            since_at = st.since_at
            metric_value = st.metric_value
            if st.holder_user_id:
                u = db.query(User).filter(User.id == st.holder_user_id).first()
                holder_username = u.username if u else None
        out.append(
            TitleLeaderboardRow(
                title_id=td.id,
                slug=td.slug,
                name=td.name,
                description=td.description,
                holder_user_id=holder_id,
                holder_username=holder_username,
                since_at=since_at,
                metric_value=metric_value,
            )
        )
    return out
