from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class LevelBase(BaseModel):
    title: str
    description: Optional[str] = None
    narrative: str
    order: int
    difficulty: int = 1


class LevelCreate(LevelBase):
    map_data: Dict[str, Any]
    golden_code: str
    golden_steps_count: int


class LevelUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    narrative: Optional[str] = None
    order: Optional[int] = None
    difficulty: Optional[int] = None
    map_data: Optional[Dict[str, Any]] = None
    golden_code: Optional[str] = None
    golden_steps_count: Optional[int] = None
    is_active: Optional[bool] = None


class LevelResponse(LevelBase):
    id: int
    map_data: Dict[str, Any]
    is_active: bool
    created_at: datetime
    golden_steps_count: Optional[int] = None
    
    class Config:
        from_attributes = True


class LevelDetailResponse(LevelResponse):
    golden_code: Optional[str] = None  # Only for admin
    golden_steps_count: Optional[int] = None


class LevelProgressBase(BaseModel):
    level_id: int


class LevelProgressCreate(LevelProgressBase):
    user_code: str
    steps_count: int


class LevelProgressResponse(LevelProgressBase):
    id: int
    user_id: int
    completed: bool
    steps_count: Optional[int] = None
    attempts: int
    best_steps_count: Optional[int] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
