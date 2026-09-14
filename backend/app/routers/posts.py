import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, get_optional_user, pagination
from app.models import Media, Post, Reply, User
from app.schemas import Message, PostCreate, PostList, PostOut, PostUpdate, ReplyCreate, ReplyList, ReplyOut
from app.services import get_post_or_404, post_out, post_query

router = APIRouter(prefix="/posts", tags=["Post / Thread"])


@router.post("", response_model=PostOut, status_code=status.HTTP_201_CREATED)
def create_post(data: PostCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    media = []
    if data.media_ids:
        if len(data.media_ids) != len(set(data.media_ids)):
            raise HTTPException(status_code=400, detail="Media items cannot be duplicated")
        media = db.scalars(
            select(Media).where(
                Media.id.in_(data.media_ids), Media.owner_id == user.id, Media.post_id.is_(None)
            )
        ).all()
        if len(media) != len(data.media_ids):
            raise HTTPException(status_code=400, detail="One or more media items are invalid")
        media_by_id = {item.id: item for item in media}
        media = [media_by_id[media_id] for media_id in data.media_ids]
    post = Post(author_id=user.id, content=data.content.strip())
    db.add(post)
    db.flush()
    for position, item in enumerate(media):
        item.post_id = post.id
        item.position = position
    db.commit()
    return post_out(db, get_post_or_404(db, post.id), user)


@router.get("", response_model=PostList)
def get_posts(
    page: tuple[int, int] = Depends(pagination),
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    offset, limit = page
    stmt = post_query()
    total = db.scalar(select(func.count()).select_from(Post).where(~Post.is_blocked)) or 0
    posts = db.scalars(stmt.order_by(Post.created_at.desc()).offset(offset).limit(limit)).all()
    return PostList(items=[post_out(db, p, viewer) for p in posts], total=total, offset=offset, limit=limit)


@router.get("/{post_id}", response_model=PostOut)
def get_post(
    post_id: uuid.UUID,
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return post_out(db, get_post_or_404(db, post_id), viewer)


@router.patch("/{post_id}", response_model=PostOut)
def update_post(
    post_id: uuid.UUID,
    data: PostUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = get_post_or_404(db, post_id)
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="You can only update your own posts")
    post.content = data.content.strip()
    db.commit()
    db.refresh(post)
    return post_out(db, post, user)


@router.delete("/{post_id}", response_model=Message)
def delete_post(post_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = get_post_or_404(db, post_id)
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    db.delete(post)
    db.commit()
    return Message(message="Post deleted")


@router.post("/{post_id}/replies", response_model=ReplyOut, status_code=201)
def create_reply(
    post_id: uuid.UUID,
    data: ReplyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models import NotificationType
    from app.services import notify

    post = get_post_or_404(db, post_id)
    reply = Reply(post_id=post.id, author_id=user.id, content=data.content.strip())
    db.add(reply)
    notify(
        db, post.author_id, user, NotificationType.REPLY, f"@{user.username} replied to your thread", post.id
    )
    db.commit()
    db.refresh(reply)
    return ReplyOut.model_validate(reply)


@router.get("/{post_id}/replies", response_model=ReplyList)
def get_replies(
    post_id: uuid.UUID,
    page: tuple[int, int] = Depends(pagination),
    db: Session = Depends(get_db),
):
    get_post_or_404(db, post_id)
    offset, limit = page
    stmt = select(Reply).options(selectinload(Reply.author)).where(Reply.post_id == post_id)
    total = db.scalar(select(func.count()).select_from(Reply).where(Reply.post_id == post_id)) or 0
    items = db.scalars(stmt.order_by(Reply.created_at).offset(offset).limit(limit)).all()
    return ReplyList(
        items=[ReplyOut.model_validate(r) for r in items], total=total, offset=offset, limit=limit
    )


@router.patch("/{post_id}/replies/{reply_id}", response_model=ReplyOut)
def update_reply(
    post_id: uuid.UUID,
    reply_id: uuid.UUID,
    data: ReplyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reply = db.scalar(
        select(Reply)
        .options(selectinload(Reply.author))
        .where(Reply.id == reply_id, Reply.post_id == post_id)
    )
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    if reply.author_id != user.id:
        raise HTTPException(status_code=403, detail="You can only update your own replies")
    reply.content = data.content.strip()
    db.commit()
    db.refresh(reply)
    return ReplyOut.model_validate(reply)


@router.delete("/{post_id}/replies/{reply_id}", response_model=Message)
def delete_reply(
    post_id: uuid.UUID,
    reply_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reply = db.scalar(select(Reply).where(Reply.id == reply_id, Reply.post_id == post_id))
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    if reply.author_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own replies")
    db.delete(reply)
    db.commit()
    return Message(message="Reply deleted")
