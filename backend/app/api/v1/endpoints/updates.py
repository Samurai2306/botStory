from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_admin, get_optional_user
from app.db.database import get_db
from app.db.models import CommunityUpdate, UpdateStatus, User
from app.schemas.updates import UpdateCreate, UpdateResponse, UpdateUpdate
from app.core.config import settings

router = APIRouter()


def _to_response(item: CommunityUpdate) -> UpdateResponse:
    return UpdateResponse(
        id=item.id,
        title=item.title,
        summary=item.summary,
        content=item.content,
        topic=item.topic,
        status=item.status,
        is_published=item.is_published,
        is_pinned=item.is_pinned,
        published_at=item.published_at,
        timeline_events=item.timeline_events or [],
        theme_config=item.theme_config or {},
        layout_blocks=item.layout_blocks or [],
        author_id=item.author_id,
        author_username=item.author.username if item.author else None,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("/", response_model=List[UpdateResponse])
async def list_updates(
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    topic: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    query = db.query(CommunityUpdate).options(joinedload(CommunityUpdate.author))
    is_admin = current_user and current_user.role.value == "admin"
    if not is_admin:
        query = query.filter(CommunityUpdate.is_published == True)  # noqa: E712
    if topic:
        query = query.filter(CommunityUpdate.topic == topic)
    updates = (
        query.order_by(desc(CommunityUpdate.is_pinned), desc(CommunityUpdate.published_at), desc(CommunityUpdate.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_to_response(i) for i in updates]


@router.get("/latest", response_model=Optional[UpdateResponse])
async def get_latest_update(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    query = db.query(CommunityUpdate).options(joinedload(CommunityUpdate.author))
    is_admin = current_user and current_user.role.value == "admin"
    if not is_admin:
        query = query.filter(CommunityUpdate.is_published == True)  # noqa: E712
    item = query.order_by(desc(CommunityUpdate.published_at), desc(CommunityUpdate.created_at)).first()
    return _to_response(item) if item else None


@router.get("/topics/list", response_model=List[str])
async def list_update_topics(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    query = db.query(CommunityUpdate.topic).distinct()
    is_admin = current_user and current_user.role.value == "admin"
    if not is_admin:
        query = query.filter(CommunityUpdate.is_published == True)  # noqa: E712
    return [row[0] for row in query.all() if row[0]]


@router.get("/{update_id}", response_model=UpdateResponse)
async def get_update(
    update_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    item = db.query(CommunityUpdate).options(joinedload(CommunityUpdate.author)).filter(CommunityUpdate.id == update_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update not found")
    is_admin = current_user and current_user.role.value == "admin"
    if not item.is_published and not is_admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update not found")
    return _to_response(item)


@router.post("/", response_model=UpdateResponse, status_code=status.HTTP_201_CREATED)
async def create_update(
    data: UpdateCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    published_at = data.published_at
    if data.is_published and not published_at:
        published_at = datetime.now(timezone.utc)
    status_value = data.status
    if data.is_published and status_value == UpdateStatus.DRAFT:
        status_value = UpdateStatus.PUBLISHED
    item = CommunityUpdate(
        title=data.title,
        summary=data.summary,
        content=data.content,
        topic=data.topic,
        status=status_value,
        is_published=data.is_published,
        is_pinned=data.is_pinned,
        published_at=published_at,
        timeline_events=[e.model_dump(mode="json") for e in data.timeline_events],
        theme_config=data.theme_config.model_dump(mode="json"),
        layout_blocks=[b.model_dump(mode="json") for b in data.layout_blocks],
        author_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.patch("/{update_id}", response_model=UpdateResponse)
async def update_update(
    update_id: int,
    data: UpdateUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.query(CommunityUpdate).options(joinedload(CommunityUpdate.author)).filter(CommunityUpdate.id == update_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update not found")
    updates = data.model_dump(exclude_unset=True)
    if "timeline_events" in updates and updates["timeline_events"] is not None:
        updates["timeline_events"] = [e.model_dump(mode="json") if hasattr(e, "model_dump") else e for e in updates["timeline_events"]]
    if "theme_config" in updates and updates["theme_config"] is not None:
        cfg = updates["theme_config"]
        updates["theme_config"] = cfg.model_dump(mode="json") if hasattr(cfg, "model_dump") else cfg
    if "layout_blocks" in updates and updates["layout_blocks"] is not None:
        updates["layout_blocks"] = [b.model_dump(mode="json") if hasattr(b, "model_dump") else b for b in updates["layout_blocks"]]

    for key, value in updates.items():
        setattr(item, key, value)

    if item.is_published and not item.published_at:
        item.published_at = datetime.now(timezone.utc)
    if item.is_published and item.status == UpdateStatus.DRAFT:
        item.status = UpdateStatus.PUBLISHED
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.post("/{update_id}/publish", response_model=UpdateResponse)
async def publish_update(
    update_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.query(CommunityUpdate).options(joinedload(CommunityUpdate.author)).filter(CommunityUpdate.id == update_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update not found")
    item.is_published = True
    item.status = UpdateStatus.PUBLISHED
    if not item.published_at:
        item.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.delete("/{update_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_update(
    update_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.query(CommunityUpdate).filter(CommunityUpdate.id == update_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Update not found")
    db.delete(item)
    db.commit()
    return None
