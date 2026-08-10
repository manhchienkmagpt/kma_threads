from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, pagination
from app.models import Follow, Post, Reply, Repost, User, UserStatus
from app.schemas import PostList, ProfileReplyList, ProfileReplyOut, ReplyOut
from app.services import post_out, post_query

router = APIRouter(prefix="/feed", tags=["Feed"])


def active_user_by_username(db: Session, username: str) -> User:
    target = db.scalar(
        select(User).where(User.username == username.lower(), User.status == UserStatus.ACTIVE)
    )
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return target


def feed_response(db, stmt, count_condition, user, page):
    offset, limit = page
    total = db.scalar(select(func.count()).select_from(Post).where(*count_condition, ~Post.is_blocked)) or 0
    posts = db.scalars(stmt.order_by(Post.created_at.desc()).offset(offset).limit(limit)).unique().all()
    return PostList(
        items=[post_out(db, post, user) for post in posts], total=total, offset=offset, limit=limit
    )


@router.get("/home", response_model=PostList)
def home_feed(
    page: tuple[int, int] = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    following_ids = select(Follow.following_id).where(Follow.follower_id == user.id)
    condition = or_(Post.author_id == user.id, Post.author_id.in_(following_ids))
    stmt = post_query().where(condition)
    return feed_response(db, stmt, [condition], user, page)


@router.get("/following", response_model=PostList)
def following_feed(
    page: tuple[int, int] = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    following_ids = select(Follow.following_id).where(Follow.follower_id == user.id)
    condition = Post.author_id.in_(following_ids)
    return feed_response(db, post_query().where(condition), [condition], user, page)


@router.get("/users/{username}", response_model=PostList)
def user_posts(
    username: str,
    page: tuple[int, int] = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = active_user_by_username(db, username)
    return feed_response(
        db, post_query().where(Post.author_id == target.id), [Post.author_id == target.id], user, page
    )


@router.get("/users/{username}/replies", response_model=ProfileReplyList)
def user_replies(
    username: str,
    page: tuple[int, int] = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = active_user_by_username(db, username)
    offset, limit = page
    visible_reply = (Reply.author_id == target.id, ~Post.is_blocked)
    total = db.scalar(
        select(func.count()).select_from(Reply).join(Post).where(*visible_reply)
    ) or 0
    stmt = (
        select(Reply)
        .join(Post)
        .options(
            selectinload(Reply.author),
            selectinload(Reply.post).selectinload(Post.author),
            selectinload(Reply.post).selectinload(Post.media),
        )
        .where(*visible_reply)
        .order_by(Reply.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    replies = db.scalars(stmt).unique().all()
    items = [
        ProfileReplyOut(
            **ReplyOut.model_validate(reply).model_dump(),
            post=post_out(db, reply.post, user),
        )
        for reply in replies
    ]
    return ProfileReplyList(items=items, total=total, offset=offset, limit=limit)


@router.get("/users/{username}/reposts", response_model=PostList)
def user_reposts(
    username: str,
    page: tuple[int, int] = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = active_user_by_username(db, username)
    offset, limit = page
    total = db.scalar(
        select(func.count())
        .select_from(Repost)
        .join(Post)
        .where(Repost.user_id == target.id, ~Post.is_blocked)
    ) or 0
    stmt = (
        post_query()
        .join(Repost, Repost.post_id == Post.id)
        .where(Repost.user_id == target.id)
        .order_by(Repost.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = db.scalars(stmt).unique().all()
    return PostList(
        items=[post_out(db, post, user) for post in posts],
        total=total,
        offset=offset,
        limit=limit,
    )
