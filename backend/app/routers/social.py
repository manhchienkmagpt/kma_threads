import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, pagination
from app.models import Bookmark, Like, NotificationType, Post, Repost, User
from app.schemas import Message, PostList, UserList
from app.services import get_post_or_404, notify, post_out, post_query, user_public

router = APIRouter(tags=["Like / Repost / Bookmark"])


@router.post("/posts/{post_id}/likes", response_model=Message, status_code=status.HTTP_201_CREATED)
def like(post_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = get_post_or_404(db, post_id)
    if not db.get(Like, {"user_id": user.id, "post_id": post.id}):
        db.add(Like(user_id=user.id, post_id=post.id))
        notify(
            db, post.author_id, user, NotificationType.LIKE, f"@{user.username} liked your thread", post.id
        )
        db.commit()
    return Message(message="Liked")


@router.delete("/posts/{post_id}/likes", response_model=Message)
def unlike(post_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(Like, {"user_id": user.id, "post_id": post_id})
    if item:
        db.delete(item)
        db.commit()
    return Message(message="Unliked")


@router.get("/posts/{post_id}/likes", response_model=UserList)
def likes(
    post_id: uuid.UUID,
    page: tuple[int, int] = Depends(pagination),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_post_or_404(db, post_id)
    offset, limit = page
    stmt = select(User).join(Like, Like.user_id == User.id).where(Like.post_id == post_id)
    total = db.scalar(select(func.count()).select_from(Like).where(Like.post_id == post_id)) or 0
    users = db.scalars(stmt.order_by(Like.created_at.desc()).offset(offset).limit(limit)).all()
    return UserList(
        items=[user_public(db, item, viewer) for item in users], total=total, offset=offset, limit=limit
    )


@router.post("/posts/{post_id}/reposts", response_model=Message, status_code=201)
def repost(post_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = get_post_or_404(db, post_id)
    if not db.get(Repost, {"user_id": user.id, "post_id": post.id}):
        db.add(Repost(user_id=user.id, post_id=post.id))
        notify(
            db,
            post.author_id,
            user,
            NotificationType.REPOST,
            f"@{user.username} reposted your thread",
            post.id,
        )
        db.commit()
    return Message(message="Reposted")


@router.delete("/posts/{post_id}/reposts", response_model=Message)
def undo_repost(post_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(Repost, {"user_id": user.id, "post_id": post_id})
    if item:
        db.delete(item)
        db.commit()
    return Message(message="Repost removed")


@router.get("/posts/{post_id}/reposts", response_model=UserList)
def reposts(
    post_id: uuid.UUID,
    page: tuple[int, int] = Depends(pagination),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_post_or_404(db, post_id)
    offset, limit = page
    stmt = select(User).join(Repost, Repost.user_id == User.id).where(Repost.post_id == post_id)
    total = db.scalar(select(func.count()).select_from(Repost).where(Repost.post_id == post_id)) or 0
    users = db.scalars(stmt.order_by(Repost.created_at.desc()).offset(offset).limit(limit)).all()
    return UserList(
        items=[user_public(db, item, viewer) for item in users], total=total, offset=offset, limit=limit
    )


@router.post("/posts/{post_id}/bookmarks", response_model=Message, status_code=201)
def bookmark(post_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_post_or_404(db, post_id)
    if not db.get(Bookmark, {"user_id": user.id, "post_id": post_id}):
        db.add(Bookmark(user_id=user.id, post_id=post_id))
        db.commit()
    return Message(message="Saved")


@router.delete("/posts/{post_id}/bookmarks", response_model=Message)
def remove_bookmark(
    post_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    item = db.get(Bookmark, {"user_id": user.id, "post_id": post_id})
    if item:
        db.delete(item)
        db.commit()
    return Message(message="Removed from saved posts")


@router.get("/bookmarks", response_model=PostList)
def bookmarks(
    page: tuple[int, int] = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    offset, limit = page
    stmt = post_query().join(Bookmark, Bookmark.post_id == Post.id).where(Bookmark.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(Bookmark).where(Bookmark.user_id == user.id)) or 0
    posts = db.scalars(stmt.order_by(Bookmark.created_at.desc()).offset(offset).limit(limit)).all()
    return PostList(items=[post_out(db, p, user) for p in posts], total=total, offset=offset, limit=limit)
