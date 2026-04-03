import asyncio
from fastapi import APIRouter, Depends, WebSocket
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.database import get_db
from app.db.models import Message, User, UserNotification

router = APIRouter()


def _get_user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    sub = payload.get("sub")
    try:
        user_id = int(sub) if sub is not None else None
    except (TypeError, ValueError):
        user_id = None
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id, User.is_active == True).first()


@router.websocket("/notifications/ws")
async def notifications_ws(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    token = websocket.query_params.get("token")
    try:
        user = _get_user_from_token(db, token)
        if not user:
            await websocket.send_json({"type": "error", "message": "unauthorized"})
            await websocket.close(code=1008)
            return

        last_unread = -1
        while True:
            unread = db.query(UserNotification).filter(
                UserNotification.user_id == user.id,
                UserNotification.is_read == False,
            ).count()
            if unread != last_unread:
                await websocket.send_json({"type": "notifications_unread", "unread_count": unread})
                last_unread = unread
            await asyncio.sleep(3)
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        db.close()


@router.websocket("/levels/{level_id}/chat/ws")
async def level_chat_ws(websocket: WebSocket, level_id: int, db: Session = Depends(get_db)):
    await websocket.accept()
    token = websocket.query_params.get("token")
    try:
        user = _get_user_from_token(db, token)
        if not user:
            await websocket.send_json({"type": "error", "message": "unauthorized"})
            await websocket.close(code=1008)
            return

        last_id = 0
        while True:
            rows = (
                db.query(Message)
                .filter(Message.level_id == level_id, Message.is_deleted == False)
                .order_by(Message.id.asc())
                .limit(200)
                .all()
            )
            max_id = rows[-1].id if rows else 0
            if max_id != last_id:
                await websocket.send_json(
                    {
                        "type": "chat_snapshot",
                        "messages": [
                            {
                                "id": m.id,
                                "content": m.content,
                                "username": m.user.username if m.user else "user",
                                "has_completed": False,
                                "is_spoiler": bool(m.is_spoiler),
                                "created_at": m.created_at.isoformat() if m.created_at else "",
                            }
                            for m in rows
                        ],
                    }
                )
                last_id = max_id
            await asyncio.sleep(2)
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        db.close()
