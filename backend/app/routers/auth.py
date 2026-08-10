import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import PasswordResetToken, RefreshToken, User, UserStatus
from app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    Message,
    RefreshRequest,
    ResetPasswordRequest,
    TokenPair,
    UserCreate,
)
from app.security import decode_token, hash_password, hash_reset_token, new_reset_token, verify_password
from app.services import token_pair, user_public

router = APIRouter(prefix="/auth", tags=["Auth"])


def utc_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def auth_response(db: Session, user: User) -> TokenPair:
    access, refresh = token_pair(db, user)
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_minutes * 60,
        user=user_public(db, user, user, include_email=True),
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    username, email = data.username.lower(), data.email.lower()
    if db.scalar(select(User).where(or_(User.email == email, User.username == username))):
        raise HTTPException(status_code=409, detail="Email or username already exists")
    user = User(
        email=email,
        username=username,
        display_name=data.display_name.strip(),
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return auth_response(db, user)


@router.post("/login", response_model=TokenPair)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    login_value = data.login.lower()
    user = db.scalar(select(User).where(or_(User.email == login_value, User.username == login_value)))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.status == UserStatus.BANNED:
        raise HTTPException(status_code=403, detail="Account is banned")
    if user.status == UserStatus.DEACTIVATED:
        user.status = UserStatus.ACTIVE
        db.commit()
    return auth_response(db, user)


@router.post("/refresh", response_model=TokenPair)
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = uuid.UUID(payload["sub"])
        stored = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    except (ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None
    now = datetime.now(UTC)
    if not stored or stored.revoked_at or utc_aware(stored.expires_at) < now:
        raise HTTPException(status_code=401, detail="Refresh token is revoked or expired")
    user = db.get(User, user_id)
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Account is unavailable")
    stored.revoked_at = now
    db.commit()
    return auth_response(db, user)


@router.post("/logout", response_model=Message)
def logout(data: RefreshRequest, db: Session = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token)
        token = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload.get("jti")))
        if token and not token.revoked_at:
            token.revoked_at = datetime.now(UTC)
            db.commit()
    except ValueError:
        pass
    return Message(message="Logged out")


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    response = {"message": "If that email exists, reset instructions have been created"}
    if user:
        raw, token_hash = new_reset_token()
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            )
        )
        db.commit()
        # Integrate an email provider here. Exposed only in local DEBUG mode for development.
        if settings.debug:
            response["reset_token"] = raw
    return response


@router.post("/reset-password", response_model=Message)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(data.token))
    )
    now = datetime.now(UTC)
    if not record or record.used_at or utc_aware(record.expires_at) < now:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user = db.get(User, record.user_id)
    user.password_hash = hash_password(data.new_password)
    record.used_at = now
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update(
        {"revoked_at": now}
    )
    db.commit()
    return Message(message="Password has been reset")
