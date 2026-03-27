from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database: в URL обязательно имя базы в конце — .../botstory (не пусто и не botstory_user)
    DATABASE_URL: str = "postgresql://botstory_user:botstory_pass@localhost:5432/botstory"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS (через .env можно задать JSON-массив: ["http://localhost:5173","http://127.0.0.1:5173"])
    BACKEND_CORS_ORIGINS: list = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Application
    PROJECT_NAME: str = "Algorithmic Robot"
    API_V1_STR: str = "/api/v1"
    GITHUB_REPO: Optional[str] = None  # e.g. "Samurai2306/botStory" для блока коммитов в сообществе

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
