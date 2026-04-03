from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.db.models import News, User
from app.schemas.news import NewsCreate, NewsUpdate, NewsResponse
from app.core.deps import get_current_admin, get_optional_user
from app.core.config import settings

router = APIRouter()


@router.get("/", response_model=List[NewsResponse])
async def list_news(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """List all news (public)"""
    query = db.query(News)
    
    # Only show published news for non-admin users
    if not current_user or current_user.role.value != "admin":
        query = query.filter(News.is_published == True)
    
    news = query.order_by(News.created_at.desc()).offset(skip).limit(limit).all()
    return news


@router.get("/{news_id}", response_model=NewsResponse)
async def get_news(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """Get single news item"""
    news = db.query(News).filter(News.id == news_id).first()
    
    if not news:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="News not found"
        )
    
    # Check if unpublished and user is not admin
    if not news.is_published and (not current_user or current_user.role.value != "admin"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="News not found"
        )
    
    return news


@router.post("/", response_model=NewsResponse, status_code=status.HTTP_201_CREATED)
async def create_news(
    news_data: NewsCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create news (admin only)"""
    db_news = News(
        author_id=current_user.id,
        **news_data.dict()
    )
    
    db.add(db_news)
    db.commit()
    db.refresh(db_news)
    
    return db_news


@router.patch("/{news_id}", response_model=NewsResponse)
async def update_news(
    news_id: int,
    news_update: NewsUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update news (admin only)"""
    news = db.query(News).filter(News.id == news_id).first()
    
    if not news:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="News not found"
        )
    
    update_data = news_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(news, field, value)
    
    db.commit()
    db.refresh(news)
    
    return news


@router.delete("/{news_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_news(
    news_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete news (admin only)"""
    news = db.query(News).filter(News.id == news_id).first()
    
    if not news:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="News not found"
        )
    
    db.delete(news)
    db.commit()
    
    return None
