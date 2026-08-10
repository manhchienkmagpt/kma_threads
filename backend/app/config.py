from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    max_upload_mb: int = 25
    deepfake_model: str = "dima806/deepfake_vs_real_image_detection"
    deepfake_threshold: float = Field(default=0.5, ge=0, le=1)
    deepfake_device: str = "cpu"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    ai_max_context_replies: int = Field(default=100, ge=1, le=500)
    ai_max_context_chars: int = Field(default=30000, ge=1000, le=100000)

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_prefix="THREADS_", extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
