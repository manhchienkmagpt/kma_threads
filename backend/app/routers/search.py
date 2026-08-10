from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, pagination
from app.models import Post, User, UserStatus
from app.schemas import PostList, UserList
from app.services import post_out, post_query, user_public

router = APIRouter(prefix="/search", tags=["Search"])


@router.get("/users", response_model=UserList)
def search_users(
    q: str = Query(min_length=1, max_length=80),
    page: tuple[int, int] = Depends(pagination),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    offset, limit = page
    pattern = f"%{q.strip()}%"
    condition = or_(User.username.ilike(pattern), User.display_name.ilike(pattern))
    stmt = select(User).where(condition, User.status == UserStatus.ACTIVE)
    total = (
        db.scalar(select(func.count()).select_from(User).where(condition, User.status == UserStatus.ACTIVE))
        or 0
    )
    users = db.scalars(stmt.order_by(User.username).offset(offset).limit(limit)).all()
    return UserList(
        items=[user_public(db, item, viewer) for item in users], total=total, offset=offset, limit=limit
    )


@router.get("/posts", response_model=PostList)
def search_posts(
    q: str = Query(min_length=1, max_length=100),
    page: tuple[int, int] = Depends(pagination),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    offset, limit = page
    condition = Post.content.ilike(f"%{q.strip()}%")
    total = db.scalar(select(func.count()).select_from(Post).where(condition, ~Post.is_blocked)) or 0
    posts = db.scalars(
        post_query().where(condition).order_by(Post.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return PostList(items=[post_out(db, p, viewer) for p in posts], total=total, offset=offset, limit=limit)
