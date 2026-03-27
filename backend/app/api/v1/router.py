from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    levels,
    notes,
    highlights,
    messages,
    news,
    execute,
    community,
    me_gamification,
    titles,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(me_gamification.router, prefix="/me", tags=["Me"])
api_router.include_router(titles.router, prefix="/titles", tags=["Titles"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(levels.router, prefix="/levels", tags=["Levels"])
api_router.include_router(notes.router, prefix="/notes", tags=["Notes"])
api_router.include_router(highlights.router, prefix="/highlights", tags=["Highlights"])
api_router.include_router(messages.router, prefix="/messages", tags=["Messages"])
api_router.include_router(news.router, prefix="/news", tags=["News"])
api_router.include_router(execute.router, prefix="/execute", tags=["Kumir Executor"])
api_router.include_router(community.router, prefix="/community", tags=["Community"])
