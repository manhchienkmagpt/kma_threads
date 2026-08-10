from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.routers import ai, auth, feed, media, moderation, notifications, posts, search, social, users
from app.schemas import Health

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Production-oriented REST API for a Threads-style social network.",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = Path(settings.upload_dir)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

for router in (
    auth.router,
    ai.router,
    users.router,
    posts.router,
    social.router,
    feed.router,
    media.router,
    notifications.router,
    search.router,
    moderation.reports_router,
    moderation.admin_router,
):
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/health", response_model=Health, tags=["System"])
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return Health(status="ok", database="connected")


@app.get("/", include_in_schema=False)
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/health"}
