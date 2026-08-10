import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, pagination, require_admin
from app.models import Notification, NotificationType, Post, Report, ReportStatus, User, UserStatus
from app.schemas import (
    AdminUserAction,
    Message,
    ReportCreate,
    ReportList,
    ReportModerate,
    ReportOut,
    UserPublic,
)
from app.services import user_public

reports_router = APIRouter(prefix="/reports", tags=["Report"])
admin_router = APIRouter(prefix="/admin", tags=["Admin"])


@reports_router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    data: ReportCreate,
    reporter: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.post_id and not db.get(Post, data.post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    if data.user_id and not db.get(User, data.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    existing = db.scalar(
        select(Report).where(
            Report.reporter_id == reporter.id,
            Report.post_id == data.post_id if data.post_id else Report.user_id == data.user_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="You already reported this target")
    report = Report(reporter_id=reporter.id, **data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@admin_router.get("/reports", response_model=ReportList)
def get_reports(
    report_status: ReportStatus | None = None,
    page: tuple[int, int] = Depends(pagination),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    offset, limit = page
    filters = [Report.status == report_status] if report_status else []
    total = db.scalar(select(func.count()).select_from(Report).where(*filters)) or 0
    items = db.scalars(
        select(Report).where(*filters).order_by(Report.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return ReportList(items=items, total=total, offset=offset, limit=limit)


@admin_router.patch("/reports/{report_id}", response_model=ReportOut)
def moderate_report(
    report_id: uuid.UUID,
    data: ReportModerate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = data.status
    report.resolution_note = data.resolution_note
    report.moderator_id = admin.id
    db.commit()
    db.refresh(report)
    return report


@admin_router.delete("/posts/{post_id}", response_model=Message)
def admin_delete_post(post_id: uuid.UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post)
    db.commit()
    return Message(message="Post deleted by moderator")


@admin_router.patch("/posts/{post_id}/block", response_model=Message)
def block_post(post_id: uuid.UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.is_blocked = True
    db.add(
        Notification(
            user_id=post.author_id,
            actor_id=admin.id,
            type=NotificationType.MODERATION,
            post_id=post.id,
            message="Your thread was hidden by a moderator",
        )
    )
    db.commit()
    return Message(message="Post blocked")


@admin_router.patch("/posts/{post_id}/unblock", response_model=Message)
def unblock_post(post_id: uuid.UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.is_blocked = False
    db.commit()
    return Message(message="Post unblocked")


@admin_router.patch("/users/{user_id}/ban", response_model=UserPublic)
def ban_user(
    user_id: uuid.UUID,
    data: AdminUserAction,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot ban yourself")
    user.status = UserStatus.BANNED
    db.commit()
    return user_public(db, user, admin)


@admin_router.patch("/users/{user_id}/unban", response_model=UserPublic)
def unban_user(
    user_id: uuid.UUID,
    _: AdminUserAction,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = UserStatus.ACTIVE
    db.commit()
    return user_public(db, user, admin)
