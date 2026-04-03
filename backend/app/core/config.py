from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database: в URL обязательно имя базы в конце — .../botstory (не пусто и не botstory_user)
    DATABASE_URL: str = "postgresql://botstory_user:botstory_pass@localhost:5432/botstory"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Security controls
    SECRET_KEY_MIN_LENGTH: int = 32
    ENABLE_TEST_ENDPOINTS: bool = False

    # Login brute-force protection
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 300
    LOGIN_MAX_ATTEMPTS_PER_IP: int = 40
    LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: int = 8
    LOGIN_LOCKOUT_SECONDS: int = 300
    LOGIN_DELAY_AFTER_FAILURES: int = 3
    LOGIN_MAX_PROGRESSIVE_DELAY_SECONDS: float = 2.0

    # Pagination caps
    PAGINATION_DEFAULT_LIMIT: int = 20
    PAGINATION_MAX_LIMIT_GENERAL: int = 100
    PAGINATION_MAX_LIMIT_CHAT: int = 200
    PAGINATION_MAX_LIMIT_NOTES: int = 100
    
    # CORS (через .env можно задать JSON-массив: ["http://localhost:5173","http://127.0.0.1:5173"])
    BACKEND_CORS_ORIGINS: list = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Application
    PROJECT_NAME: str = "Algorithmic Robot"
    API_V1_STR: str = "/api/v1"
    GITHUB_REPO: Optional[str] = None  # e.g. "Samurai2306/botStory" для блока коммитов в сообществе

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        secret = (value or "").strip()
        insecure_values = {
            "your-secret-key-change-in-production",
            "secret",
            "changeme",
            "password",
        }
        if not secret:
            raise ValueError("SECRET_KEY is required and cannot be empty")
        if secret.lower() in insecure_values:
            raise ValueError("SECRET_KEY uses a known insecure value")
        if len(secret) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return secret

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
