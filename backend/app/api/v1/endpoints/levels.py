from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.db.models import Level, LevelProgress, LevelWords, User, UserRole
from app.schemas.level import (
    LevelCreate, LevelUpdate, LevelResponse, LevelDetailResponse,
    LevelProgressCreate, LevelProgressResponse
)
from app.schemas.level_words import LevelWordsUpdate, LevelWordsResponse
from app.core.deps import get_current_user, get_current_admin, get_optional_user
from kumir.loop_detect import kumir_code_contains_loop
from app.services.gamification_hooks import sync_gamification_for_users

router = APIRouter()


@router.get("/", response_model=List[LevelResponse])
async def list_levels(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """List all active levels"""
    query = db.query(Level).filter(Level.is_active == True).order_by(Level.order)
    levels = query.offset(skip).limit(limit).all()
    return levels


@router.get("/{level_id}", response_model=LevelDetailResponse)
async def get_level(
    level_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """Get level details"""
    level = db.query(Level).filter(Level.id == level_id).first()
    if not level:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Level not found"
        )
    
    response = LevelDetailResponse.from_orm(level)
    
    # Only admin can see golden code
    if not current_user or current_user.role != UserRole.ADMIN:
        response.golden_code = None
        response.golden_steps_count = None
    
    return response


@router.post("/", response_model=LevelResponse, status_code=status.HTTP_201_CREATED)
async def create_level(
    level_data: LevelCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new level (admin only)"""
    # Check if order is unique
    existing = db.query(Level).filter(Level.order == level_data.order).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Level with order {level_data.order} already exists"
        )
    
    db_level = Level(**level_data.dict())
    db.add(db_level)
    db.commit()
    db.refresh(db_level)
    
    return db_level


@router.patch("/{level_id}", response_model=LevelResponse)
async def update_level(
    level_id: int,
    level_update: LevelUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update level (admin only)"""
    level = db.query(Level).filter(Level.id == level_id).first()
    if not level:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Level not found"
        )
    
    update_data = level_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(level, field, value)
    
    db.commit()
    db.refresh(level)
    
    return level


@router.delete("/{level_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_level(
    level_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Soft delete level (admin only)"""
    level = db.query(Level).filter(Level.id == level_id).first()
    if not level:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Level not found"
        )
    
    level.is_active = False
    db.commit()
    
    return None


@router.get("/{level_id}/words", response_model=LevelWordsResponse)
async def get_level_words(
    level_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's 10 words for this level"""
    level = db.query(Level).filter(Level.id == level_id).first()
    if not level:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Level not found")
    row = db.query(LevelWords).filter(
        LevelWords.level_id == level_id,
        LevelWords.user_id == current_user.id
    ).first()
    return LevelWordsResponse(words=row.words if row else [])


@router.put("/{level_id}/words", response_model=LevelWordsResponse)
async def set_level_words(
    level_id: int,
    data: LevelWordsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Set current user's words for this level (max 10)"""
    level = db.query(Level).filter(Level.id == level_id).first()
    if not level:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Level not found")
    row = db.query(LevelWords).filter(
        LevelWords.level_id == level_id,
        LevelWords.user_id == current_user.id
    ).first()
    words = data.words[:10]
    if row:
        row.words = words
        db.commit()
        db.refresh(row)
        return LevelWordsResponse(words=row.words)
    row = LevelWords(user_id=current_user.id, level_id=level_id, words=words)
    db.add(row)
    db.commit()
    db.refresh(row)
    return LevelWordsResponse(words=row.words)


@router.get("/{level_id}/progress", response_model=LevelProgressResponse)
async def get_level_progress(
    level_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's progress for a level"""
    progress = db.query(LevelProgress).filter(
        LevelProgress.level_id == level_id,
        LevelProgress.user_id == current_user.id
    ).first()
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progress not found"
        )
    
    return progress


@router.post("/{level_id}/progress", response_model=LevelProgressResponse)
async def submit_level_solution(
    level_id: int,
    progress_data: LevelProgressCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a solution for a level"""
    try:
        level = db.query(Level).filter(Level.id == level_id).first()
        if not level:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Level not found"
            )
        
        # Get or create progress
        progress = db.query(LevelProgress).filter(
            LevelProgress.level_id == level_id,
            LevelProgress.user_id == current_user.id
        ).first()
        
        code_has_loop = kumir_code_contains_loop(progress_data.user_code)
        if not progress:
            progress = LevelProgress(
                user_id=current_user.id,
                level_id=level_id,
                attempts=0,
                steps_count=progress_data.steps_count,
                user_code=progress_data.user_code,
                completed=True,
                completed_at=datetime.utcnow(),
                best_steps_count=progress_data.steps_count,
                completed_ever_without_loops=(not code_has_loop),
            )
            db.add(progress)
        else:
            progress.attempts = (progress.attempts or 0) + 1
            progress.user_code = progress_data.user_code
            progress.steps_count = progress_data.steps_count
            progress.completed = True
            progress.completed_at = datetime.utcnow()
            if progress.best_steps_count is None or progress_data.steps_count < progress.best_steps_count:
                progress.best_steps_count = progress_data.steps_count
            if not code_has_loop:
                progress.completed_ever_without_loops = True

        sync_gamification_for_users(db, current_user.id)
        db.commit()
        db.refresh(progress)

        return progress
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save progress: {str(e)}"
        )
