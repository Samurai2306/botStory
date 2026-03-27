from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.db.models import Message, User, LevelProgress
from app.schemas.message import MessageCreate, MessageResponse
from app.core.deps import get_current_user, get_current_admin
from app.services.gamification_hooks import sync_gamification_for_users

router = APIRouter()


@router.get("/level/{level_id}", response_model=List[MessageResponse])
async def get_level_messages(
    level_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all messages for a level chat"""
    messages = db.query(Message).filter(
        Message.level_id == level_id,
        Message.is_deleted == False
    ).order_by(Message.created_at).offset(skip).limit(limit).all()
    
    # Enrich messages with user info and completion status
    result = []
    for msg in messages:
        msg_dict = MessageResponse.from_orm(msg)
        msg_dict.username = msg.user.username
        
        # Check if user completed the level (veteran badge)
        progress = db.query(LevelProgress).filter(
            LevelProgress.user_id == msg.user_id,
            LevelProgress.level_id == level_id,
            LevelProgress.completed == True
        ).first()
        msg_dict.has_completed = progress is not None
        
        # Check if message contains spoiler tag
        if '[spoiler]' in msg.content.lower():
            msg_dict.is_spoiler = True
        
        result.append(msg_dict)
    
    return result


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Post a message to level chat"""
    # Check if message contains spoiler tag
    is_spoiler = '[spoiler]' in message_data.content.lower()
    
    db_message = Message(
        level_id=message_data.level_id,
        user_id=current_user.id,
        content=message_data.content,
        is_spoiler=is_spoiler
    )
    
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    sync_gamification_for_users(db, current_user.id)
    db.commit()

    # Create response with enriched data
    response = MessageResponse.from_orm(db_message)
    response.username = current_user.username
    
    # Check completion status
    progress = db.query(LevelProgress).filter(
        LevelProgress.user_id == current_user.id,
        LevelProgress.level_id == message_data.level_id,
        LevelProgress.completed == True
    ).first()
    response.has_completed = progress is not None
    
    return response


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a message (admin only, soft delete)"""
    message = db.query(Message).filter(Message.id == message_id).first()
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    message.is_deleted = True
    db.commit()
    
    return None
