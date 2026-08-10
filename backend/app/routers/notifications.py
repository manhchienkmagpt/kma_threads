import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, pagination
from app.models import Notification, User
from app.schemas import Message, NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["Notification"])


@router.get("", response_model=NotificationList)
def notifications(
    page: tuple[int, int] = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    offset, limit = page
    stmt = (
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    items = db.scalars(stmt).all()
    unread = (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, ~Notification.is_read)
        )
        or 0
    )
    return NotificationList(
        items=[NotificationOut.model_validate(item) for item in items],
        unread_count=unread,
        offset=offset,
        limit=limit,
    )


@router.patch("/read-all", response_model=Message)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(is_read=True))
    db.commit()
    return Message(message="All notifications marked as read")


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.is_read = True
    db.commit()
    return item


@router.delete("/{notification_id}", response_model=Message)
def delete_notification(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(item)
    db.commit()
    return Message(message="Notification deleted")
