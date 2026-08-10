import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_optional_user, pagination
from app.models import Follow, NotificationType, User, UserStatus
from app.schemas import Message, UserCreate, UserList, UserMe, UserPublic, UserUpdate
from app.security import hash_password
from app.services import notify, user_public

router = APIRouter(prefix="/users", tags=["User"])


@router.post("", response_model=UserMe, status_code=status.HTTP_201_CREATED)
def create_account(data: UserCreate, db: Session = Depends(get_db)):
    username, email = data.username.lower(), data.email.lower()
    if db.scalar(select(User).where(or_(User.username == username, User.email == email))):
        raise HTTPException(status_code=409, detail="Email or username already exists")
    user = User(
        username=username,
        email=email,
        display_name=data.display_name.strip(),
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_public(db, user, user, include_email=True)


@router.get("/me", response_model=UserMe)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_public(db, user, user, include_email=True)


@router.patch("/me", response_model=UserMe)
def update_me(data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    values = data.model_dump(exclude_unset=True)
    if "username" in values:
        values["username"] = values["username"].lower()
        exists = db.scalar(select(User).where(User.username == values["username"], User.id != user.id))
        if exists:
            raise HTTPException(status_code=409, detail="Username already exists")
    for key, value in values.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user_public(db, user, user, include_email=True)


@router.delete("/me", response_model=Message)
def deactivate_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.status = UserStatus.DEACTIVATED
    db.commit()
    return Message(message="Account deactivated; logging in will reactivate it")


@router.get("/{username}", response_model=UserPublic)
def get_profile(
    username: str,
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.username == username.lower(), User.status == UserStatus.ACTIVE))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_public(db, user, viewer)


@router.post("/{user_id}/follow", response_model=Message, status_code=201)
def follow_user(user_id: uuid.UUID, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target or target.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    if db.get(Follow, {"follower_id": current.id, "following_id": target.id}):
        return Message(message="Already following")
    db.add(Follow(follower_id=current.id, following_id=target.id))
    notify(db, target.id, current, NotificationType.FOLLOW, f"@{current.username} followed you")
    db.commit()
    return Message(message="Followed")


@router.delete("/{user_id}/follow", response_model=Message)
def unfollow_user(
    user_id: uuid.UUID, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    follow = db.get(Follow, {"follower_id": current.id, "following_id": user_id})
    if follow:
        db.delete(follow)
        db.commit()
    return Message(message="Unfollowed")


def relation_list(db: Session, target_id: uuid.UUID, followers: bool, offset: int, limit: int, viewer: User):
    relation_id = Follow.follower_id if followers else Follow.following_id
    condition = Follow.following_id == target_id if followers else Follow.follower_id == target_id
    stmt = (
        select(User).join(Follow, User.id == relation_id).where(condition, User.status == UserStatus.ACTIVE)
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Follow.created_at.desc()).offset(offset).limit(limit)).all()
    return UserList(
        items=[user_public(db, item, viewer) for item in items],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/{user_id}/followers", response_model=UserList)
def get_followers(
    user_id: uuid.UUID,
    page: tuple[int, int] = Depends(pagination),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return relation_list(db, user_id, True, *page, viewer)


@router.get("/{user_id}/following", response_model=UserList)
def get_following(
    user_id: uuid.UUID,
    page: tuple[int, int] = Depends(pagination),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return relation_list(db, user_id, False, *page, viewer)
