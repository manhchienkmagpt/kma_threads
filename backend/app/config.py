from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "KMA Threads"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://threads:threads@localhost:5432/threads"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    frontend_url: str = "http://localhost:5173"
    debug: bool = False
    upload_dir: str = "uploads"
    media_base_url: str = "http://localhost:8000/uploads"
    max_upload_mb: int = 25
    image_model_path: str = str(PROJECT_ROOT / "best_model.pth")
    ai_generated_threshold: float = Field(default=0.5, ge=0, le=1)
    image_model_device: str = "cpu"
    api_key_encryption_secret: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    florence_model: str = "florence-community/Florence-2-large"
    ai_max_context_replies: int = Field(default=100, ge=1, le=500)
    ai_max_context_chars: int = Field(default=30000, ge=1000, le=100000)

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_prefix="THREADS_", extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
