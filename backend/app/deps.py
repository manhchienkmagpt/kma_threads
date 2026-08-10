import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, UserStatus
from app.security import decode_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if not credentials:
        raise error
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise ValueError
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise error from None
    user = db.get(User, user_id)
    if not user or user.status != UserStatus.ACTIVE:
        raise error
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    return get_current_user(credentials, db)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def pagination(offset: int = 0, limit: int = 20) -> tuple[int, int]:
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(status_code=422, detail="offset >= 0 and 1 <= limit <= 100")
    return offset, limit
