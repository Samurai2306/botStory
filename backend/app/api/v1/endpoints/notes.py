from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.db.models import Note, User
from app.schemas.note import NoteCreate, NoteUpdate, NoteResponse
from app.core.deps import get_current_user
from app.core.config import settings

router = APIRouter()


@router.get("/", response_model=List[NoteResponse])
async def list_notes(
    level_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(settings.PAGINATION_DEFAULT_LIMIT, ge=1, le=settings.PAGINATION_MAX_LIMIT_NOTES),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List current user's notes"""
    query = db.query(Note).filter(Note.user_id == current_user.id)
    
    if level_id is not None:
        query = query.filter(Note.level_id == level_id)
    
    notes = query.order_by(Note.created_at.desc()).offset(skip).limit(limit).all()
    return notes


@router.post("/", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    note_data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new note"""
    db_note = Note(
        user_id=current_user.id,
        **note_data.dict()
    )
    
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    
    return db_note


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    note_update: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a note"""
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    update_data = note_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(note, field, value)
    
    db.commit()
    db.refresh(note)
    
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a note"""
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    db.delete(note)
    db.commit()
    
    return None
