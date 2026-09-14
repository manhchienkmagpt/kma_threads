import json
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import Follow, Like, Media, Post, Reply, Repost, User, UserRole
from app.security import hash_password

DEMO_PASSWORD = "Password123!"
SEED_DATA_PATH = Path(__file__).with_name("seed_data") / "threads_seed.json"
SEED_MEDIA_PATH = SEED_DATA_PATH.parent / "media"
SEED_NAMESPACE = uuid.UUID("41d6e52e-012a-4875-b77a-28df01a37d3f")
LEGACY_SEED_EMAILS = {
    "admin.demo@kma.edu.vn",
    "an.nguyen.demo@kma.edu.vn",
    "linh.tran.demo@kma.edu.vn",
    "minh.le.demo@kma.edu.vn",
    "thu.pham.demo@kma.edu.vn",
    "quang.do.demo@kma.edu.vn",
    "mai.hoang.demo@kma.edu.vn",
    "nam.vo.demo@kma.edu.vn",
    "vy.bui.demo@kma.edu.vn",
    "khoa.nguyen.demo@kma.edu.vn",
}
LEGACY_SEED_USERNAMES = {
    "admin",
    "an.nguyen",
    "linh.tran",
    "minh.le",
    "thu.pham",
    "quang.do",
    "mai.hoang",
    "nam.vo",
    "vy.bui",
    "khoa.nguyen",
}
REPLY_TEMPLATES = (
    "Mình cũng nghĩ vậy, cảm ơn bạn đã chia sẻ!",
    "Ý tưởng hay đó. Mình sẽ tìm hiểu thêm về chủ đề này.",
)


def _load_snapshot() -> dict:
    data = json.loads(SEED_DATA_PATH.read_text(encoding="utf-8"))
    profiles = data.get("profiles", [])
    posts_per_user = data.get("posts_per_user")
    if len(profiles) != 10 or posts_per_user != 4:
        raise ValueError("Threads seed snapshot must contain 10 profiles and 4 posts per profile")
    if any(len(profile.get("posts", [])) != posts_per_user for profile in profiles):
        raise ValueError("Every Threads seed profile must contain exactly 4 posts")
    return data


def _seed_id(kind: str, *parts: object) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, ":".join((kind, *(str(part) for part in parts))))


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _copy_seed_asset(filename: str) -> Path:
    source = (SEED_MEDIA_PATH / filename).resolve()
    media_root = SEED_MEDIA_PATH.resolve()
    if media_root not in source.parents or not source.is_file():
        raise ValueError(f"Invalid or missing seed media asset: {filename}")
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = upload_dir / f"seed-{filename}"
    shutil.copyfile(source, destination)
    return destination


def _media_url(filename: str) -> str:
    return f"{settings.media_base_url.rstrip('/')}/seed-{filename}"


def _remove_legacy_seed_users(db) -> int:
    candidates = db.scalars(select(User).where(User.username.in_(LEGACY_SEED_USERNAMES))).all()
    legacy_users = [
        user
        for user in candidates
        if user.email in LEGACY_SEED_EMAILS or user.email.endswith("@threads.local")
    ]
    for user in legacy_users:
        db.delete(user)
    if legacy_users:
        db.flush()
    return len(legacy_users)


def _upsert_user(db, profile: dict, password_hash: str) -> tuple[User, bool]:
    username = profile["username"]
    user = db.scalar(select(User).where(User.username == username))
    created = user is None
    if user is None:
        user = User(
            id=_seed_id("user", username),
            username=username,
            email=f"{username}.seed@kma.edu.vn",
            display_name=profile["display_name"],
            password_hash=password_hash,
        )
        db.add(user)
    user.display_name = profile["display_name"]
    user.bio = profile.get("bio")
    user.website = profile.get("profile_url")
    user.role = UserRole.ADMIN if username == "threads" else UserRole.USER
    user.is_verified = True
    avatar_file = profile.get("avatar_file")
    user.avatar_url = _media_url(avatar_file) if avatar_file else None
    if avatar_file:
        _copy_seed_asset(avatar_file)
    db.flush()
    return user, created


def _upsert_posts(db, user: User, profile: dict) -> tuple[list[Post], int]:
    posts = []
    created = 0
    expected_ids = {
        _seed_id("post", profile["username"], index)
        for index in range(len(profile["posts"]))
    }
    existing_seed_posts = db.scalars(
        select(Post).where(Post.author_id == user.id, Post.id.in_(expected_ids))
    ).all()
    by_id = {post.id: post for post in existing_seed_posts}

    for index, post_data in enumerate(profile["posts"]):
        post_id = _seed_id("post", profile["username"], index)
        post = by_id.get(post_id)
        if post is None:
            post = Post(id=post_id, author_id=user.id)
            db.add(post)
            created += 1
        post.content = post_data["text"]
        post.created_at = _parse_datetime(post_data["timestamp"])
        post.is_blocked = False
        db.flush()

        expected_media_ids = set()
        existing_media = {item.id: item for item in post.media}
        for position, media_data in enumerate(post_data.get("media", [])):
            media_id = _seed_id("media", profile["username"], index, position)
            expected_media_ids.add(media_id)
            item = existing_media.get(media_id)
            if item is None:
                item = Media(id=media_id, owner_id=user.id, post_id=post.id)
                db.add(item)
            path = _copy_seed_asset(media_data["file"])
            item.url = _media_url(media_data["file"])
            item.storage_path = str(path)
            item.mime_type = media_data["mime_type"]
            item.size_bytes = path.stat().st_size
            item.position = position
        for media_id, item in existing_media.items():
            if media_id not in expected_media_ids:
                db.delete(item)
        posts.append(post)
    db.flush()
    return posts, created


def _seed_social_graph(db, users: list[User], posts_by_user: dict[uuid.UUID, list[Post]]) -> None:
    for index, user in enumerate(users):
        for step in range(1, 4):
            target = users[(index + step) % len(users)]
            key = {"follower_id": user.id, "following_id": target.id}
            if not db.get(Follow, key):
                db.add(Follow(**key))

        for step, reply_content in enumerate(REPLY_TEMPLATES, start=1):
            target = users[(index + step) % len(users)]
            target_post = posts_by_user[target.id][step - 1]
            interaction_key = {"user_id": user.id, "post_id": target_post.id}
            if not db.get(Repost, interaction_key):
                db.add(Repost(**interaction_key))
            if not db.get(Like, interaction_key):
                db.add(Like(**interaction_key))
            reply_exists = db.scalar(
                select(Reply).where(
                    Reply.author_id == user.id,
                    Reply.post_id == target_post.id,
                    Reply.content == reply_content,
                )
            )
            if not reply_exists:
                db.add(
                    Reply(author_id=user.id, post_id=target_post.id, content=reply_content)
                )


def run():
    snapshot = _load_snapshot()
    with SessionLocal() as db:
        removed_legacy_users = _remove_legacy_seed_users(db)
        password_hash = hash_password(DEMO_PASSWORD)
        users: list[User] = []
        posts_by_user: dict[uuid.UUID, list[Post]] = {}
        created_users = 0
        created_posts = 0

        for profile in snapshot["profiles"]:
            user, was_created = _upsert_user(db, profile, password_hash)
            posts, post_count = _upsert_posts(db, user, profile)
            users.append(user)
            posts_by_user[user.id] = posts
            created_users += int(was_created)
            created_posts += post_count

        _seed_social_graph(db, users, posts_by_user)
        db.commit()
        print(
            f"Seed complete: removed {removed_legacy_users} legacy users; "
            f"added {created_users} users and {created_posts} posts from the Threads snapshot. "
            f"Demo login: threads / {DEMO_PASSWORD}"
        )


if __name__ == "__main__":
    run()
