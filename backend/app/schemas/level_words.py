from pydantic import BaseModel, field_validator
from typing import List


class LevelWordsUpdate(BaseModel):
    words: List[str]

    @field_validator("words")
    @classmethod
    def words_max_10(cls, v: List[str]) -> List[str]:
        cleaned = [w.strip() for w in v if w and str(w).strip()]
        if len(cleaned) > 10:
            raise ValueError("Maximum 10 words allowed")
        return cleaned


class LevelWordsResponse(BaseModel):
    words: List[str]

    class Config:
        from_attributes = True
