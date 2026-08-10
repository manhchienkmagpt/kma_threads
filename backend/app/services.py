import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models import Bookmark, Follow, Like, Notification, Post, RefreshToken, Reply, Repost, User
from app.schemas import MediaOut, PostOut, UserMe, UserPublic, UserSummary
from app.security import create_token


def user_summary(user: User) -> UserSummary:
    return UserSummary.model_validate(user)


def user_public(db: Session, user: User, viewer: User | None = None, include_email: bool = False):
    followers = db.scalar(select(func.count()).select_from(Follow).where(Follow.following_id == user.id)) or 0
    following = db.scalar(select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)) or 0
    posts = (
        db.scalar(select(func.count()).select_from(Post).where(Post.author_id == user.id, ~Post.is_blocked))
        or 0
    )
    replies = db.scalar(
        select(func.count())
        .select_from(Reply)
        .join(Post)
        .where(Reply.author_id == user.id, ~Post.is_blocked)
    ) or 0
    reposts = db.scalar(
        select(func.count())
        .select_from(Repost)
        .join(Post)
        .where(Repost.user_id == user.id, ~Post.is_blocked)
    ) or 0
    follows = bool(viewer and db.get(Follow, {"follower_id": viewer.id, "following_id": user.id}))
    values = {
        **UserPublic.model_validate(user).model_dump(),
        "followers_count": followers,
        "following_count": following,
        "posts_count": posts,
        "replies_count": replies,
        "reposts_count": reposts,
        "is_following": follows,
    }
    if include_email:
        values["email"] = user.email
        values["ai_assistant_enabled"] = user.ai_assistant_enabled
        return UserMe(**values)
    return UserPublic(**values)


def post_query():
    return select(Post).options(selectinload(Post.author), selectinload(Post.media)).where(~Post.is_blocked)


def post_out(db: Session, post: Post, viewer: User | None = None) -> PostOut:
    likes = db.scalar(select(func.count()).select_from(Like).where(Like.post_id == post.id)) or 0
    replies = db.scalar(select(func.count()).select_from(Reply).where(Reply.post_id == post.id)) or 0
    reposts = db.scalar(select(func.count()).select_from(Repost).where(Repost.post_id == post.id)) or 0
    return PostOut(
        id=post.id,
        content=post.content,
        author=user_summary(post.author),
        media=[MediaOut.model_validate(item) for item in post.media],
        created_at=post.created_at,
        updated_at=post.updated_at,
        likes_count=likes,
        replies_count=replies,
        reposts_count=reposts,
        liked=bool(viewer and db.get(Like, {"user_id": viewer.id, "post_id": post.id})),
        reposted=bool(viewer and db.get(Repost, {"user_id": viewer.id, "post_id": post.id})),
        bookmarked=bool(viewer and db.get(Bookmark, {"user_id": viewer.id, "post_id": post.id})),
    )


def token_pair(db: Session, user: User):
    access = create_token(str(user.id), "access", timedelta(minutes=settings.access_token_minutes))
    jti = uuid.uuid4().hex
    expires = datetime.now(UTC) + timedelta(days=settings.refresh_token_days)
    refresh = create_token(str(user.id), "refresh", timedelta(days=settings.refresh_token_days), jti)
    db.add(RefreshToken(user_id=user.id, jti=jti, expires_at=expires))
    db.commit()
    return access, refresh


def notify(
    db: Session,
    recipient_id: uuid.UUID,
    actor: User,
    notification_type,
    message: str,
    post_id: uuid.UUID | None = None,
):
    if recipient_id == actor.id:
        return
    db.add(
        Notification(
            user_id=recipient_id,
            actor_id=actor.id,
            type=notification_type,
            message=message,
            post_id=post_id,
        )
    )


def get_post_or_404(db: Session, post_id: uuid.UUID) -> Post:
    from fastapi import HTTPException

    post = db.scalar(post_query().where(Post.id == post_id))
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post
