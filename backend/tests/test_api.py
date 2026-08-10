import uuid
from unittest.mock import AsyncMock

from sqlalchemy import func, select

from app import seed
from app.ai_assistant import AssistantResult, AssistantSource
from app.image_authenticity import ImageAuthenticityResult, ImageModerationUnavailableError
from app.models import Media, Post, Reply, Repost, User, UserRole
from app.routers import ai as ai_router
from app.routers import media as media_router
from tests.conftest import TestingSession


def test_register_login_and_profile(client, registered):
    data, headers = registered
    assert data["user"]["username"] == "an.nguyen"

    profile = client.get("/api/v1/users/an.nguyen", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["followers_count"] == 0

    login = client.post("/api/v1/auth/login", json={"login": "an.nguyen", "password": "Password123!"})
    assert login.status_code == 200
    assert login.json()["access_token"]

    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login.json()["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] != login.json()["refresh_token"]


def test_password_reset_revokes_old_password(client, registered):
    response = client.post("/api/v1/auth/forgot-password", json={"email": "an@example.com"})
    assert response.status_code == 200
    reset_token = response.json()["reset_token"]
    assert client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "NewPassword123!"},
    ).status_code == 200
    assert client.post(
        "/api/v1/auth/login", json={"login": "an.nguyen", "password": "NewPassword123!"}
    ).status_code == 200


def test_post_reply_like_bookmark_and_feed(client, registered):
    _, headers = registered
    created = client.post(
        "/api/v1/posts", headers=headers, json={"content": "Hello FastAPI", "media_ids": []}
    )
    assert created.status_code == 201, created.text
    post_id = created.json()["id"]

    assert client.post(f"/api/v1/posts/{post_id}/likes", headers=headers).status_code == 201
    assert client.post(f"/api/v1/posts/{post_id}/reposts", headers=headers).status_code == 201
    assert client.post(f"/api/v1/posts/{post_id}/bookmarks", headers=headers).status_code == 201
    reply = client.post(f"/api/v1/posts/{post_id}/replies", headers=headers, json={"content": "First reply"})
    assert reply.status_code == 201, reply.text
    reply_id = reply.json()["id"]

    fetched = client.get(f"/api/v1/posts/{post_id}", headers=headers).json()
    assert (fetched["likes_count"], fetched["replies_count"], fetched["reposts_count"]) == (1, 1, 1)
    assert fetched["liked"] and fetched["reposted"] and fetched["bookmarked"]

    profile = client.get("/api/v1/users/an.nguyen", headers=headers).json()
    assert profile["replies_count"] == 1
    assert profile["reposts_count"] == 1

    profile_replies = client.get("/api/v1/feed/users/an.nguyen/replies", headers=headers)
    assert profile_replies.status_code == 200, profile_replies.text
    assert profile_replies.json()["items"][0]["content"] == "First reply"
    assert profile_replies.json()["items"][0]["post"]["id"] == post_id

    profile_reposts = client.get("/api/v1/feed/users/an.nguyen/reposts", headers=headers)
    assert profile_reposts.status_code == 200, profile_reposts.text
    assert profile_reposts.json()["items"][0]["id"] == post_id

    feed = client.get("/api/v1/feed/home", headers=headers)
    assert feed.status_code == 200
    assert feed.json()["items"][0]["content"] == "Hello FastAPI"
    assert client.get("/api/v1/bookmarks", headers=headers).json()["total"] == 1

    edited = client.patch(
        f"/api/v1/posts/{post_id}/replies/{reply_id}",
        headers=headers,
        json={"content": "Edited reply"},
    )
    assert edited.status_code == 200
    assert edited.json()["content"] == "Edited reply"
    assert client.delete(
        f"/api/v1/posts/{post_id}/replies/{reply_id}", headers=headers
    ).status_code == 200
    assert client.get(f"/api/v1/posts/{post_id}/replies", headers=headers).json()["total"] == 0


def test_follow_and_notification(client, registered):
    _, first_headers = registered
    second = client.post(
        "/api/v1/auth/register",
        json={
            "email": "linh@example.com",
            "username": "linh.tran",
            "display_name": "Linh Tran",
            "password": "Password123!",
        },
    ).json()
    second_headers = {"Authorization": f"Bearer {second['access_token']}"}

    followed = client.post(f"/api/v1/users/{second['user']['id']}/follow", headers=first_headers)
    assert followed.status_code == 201
    notifications = client.get("/api/v1/notifications", headers=second_headers).json()
    assert notifications["unread_count"] == 1
    assert notifications["items"][0]["type"] == "follow"


def test_ai_assistant_requires_opt_in_and_supports_all_actions(client, registered, monkeypatch):
    _, headers = registered
    created = client.post(
        "/api/v1/posts",
        headers=headers,
        json={"content": "Trái Đất quay quanh Mặt Trời.", "media_ids": []},
    ).json()
    post_id = created["id"]
    client.post(
        f"/api/v1/posts/{post_id}/replies",
        headers=headers,
        json={"content": "Đây là kiến thức thiên văn cơ bản."},
    )

    disabled = client.post(f"/api/v1/ai/posts/{post_id}/summarize", headers=headers)
    assert disabled.status_code == 403

    enabled = client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"ai_assistant_enabled": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["ai_assistant_enabled"] is True
    assert "ai_assistant_enabled" not in client.get(
        "/api/v1/users/an.nguyen", headers=headers
    ).json()

    mocked_gemini = AsyncMock(
        return_value=AssistantResult(
            content="Kết quả AI",
            sources=[AssistantSource(title="NASA", url="https://www.nasa.gov/")],
        )
    )
    monkeypatch.setattr(ai_router, "generate_response", mocked_gemini)

    write = client.post(
        "/api/v1/ai/write",
        headers=headers,
        json={"content": "hom nay troi dep", "action": "spellcheck"},
    )
    fact_check = client.post(f"/api/v1/ai/posts/{post_id}/fact-check", headers=headers)
    question = client.post(
        f"/api/v1/ai/posts/{post_id}/ask",
        headers=headers,
        json={"question": "Thread đang nói về điều gì?"},
    )
    summary = client.post(f"/api/v1/ai/posts/{post_id}/summarize", headers=headers)
    suggestion = client.post(f"/api/v1/ai/posts/{post_id}/suggest-reply", headers=headers)

    for response in (write, fact_check, question, summary, suggestion):
        assert response.status_code == 200, response.text
        assert response.json()["content"] == "Kết quả AI"
    assert fact_check.json()["sources"][0]["title"] == "NASA"
    assert fact_check.json()["disclaimer"]
    assert mocked_gemini.await_count == 5
    assert any(call.kwargs.get("use_search") for call in mocked_gemini.await_args_list)
    assert any("kiến thức thiên văn" in call.kwargs["prompt"] for call in mocked_gemini.await_args_list)


def test_image_upload_rejects_fake_and_accepts_real(
    client, registered, monkeypatch, test_upload_dir
):
    _, headers = registered
    monkeypatch.setattr(media_router.settings, "upload_dir", str(test_upload_dir))
    monkeypatch.setattr(
        media_router,
        "classify_image",
        lambda _: ImageAuthenticityResult(fake_score=0.98, real_score=0.02),
    )

    rejected = client.post(
        "/api/v1/media",
        headers=headers,
        files={"file": ("fake.png", b"fake image bytes", "image/png")},
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == (
        "Ảnh bạn vừa tải lên là ảnh fake và không thể đăng lên được."
    )
    assert list(test_upload_dir.iterdir()) == []

    monkeypatch.setattr(
        media_router,
        "classify_image",
        lambda _: ImageAuthenticityResult(fake_score=0.03, real_score=0.97),
    )
    accepted = client.post(
        "/api/v1/media",
        headers=headers,
        files={"file": ("real.png", b"real image bytes", "image/png")},
    )
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["mime_type"] == "image/png"
    assert len(list(test_upload_dir.iterdir())) == 1
    with TestingSession() as db:
        assert db.scalar(select(func.count()).select_from(Media)) == 1


def test_image_upload_fails_closed_when_model_is_unavailable(
    client, registered, monkeypatch, test_upload_dir
):
    _, headers = registered
    monkeypatch.setattr(media_router.settings, "upload_dir", str(test_upload_dir))

    def unavailable(_):
        raise ImageModerationUnavailableError("offline")

    monkeypatch.setattr(media_router, "classify_image", unavailable)
    response = client.post(
        "/api/v1/media",
        headers=headers,
        files={"file": ("photo.jpg", b"image bytes", "image/jpeg")},
    )
    assert response.status_code == 503
    assert list(test_upload_dir.iterdir()) == []


def test_admin_moderates_report(client, registered):
    first, headers = registered
    with TestingSession() as db:
        admin = db.get(User, uuid.UUID(first["user"]["id"]))
        admin.role = UserRole.ADMIN
        db.commit()

    other = client.post(
        "/api/v1/auth/register",
        json={
            "email": "other@example.com",
            "username": "other.user",
            "display_name": "Other User",
            "password": "Password123!",
        },
    ).json()
    report = client.post(
        "/api/v1/reports",
        headers={"Authorization": f"Bearer {other['access_token']}"},
        json={"user_id": first["user"]["id"], "reason": "spam"},
    )
    assert report.status_code == 201, report.text
    queue = client.get("/api/v1/admin/reports", headers=headers)
    assert queue.status_code == 200
    report_id = queue.json()["items"][0]["id"]
    resolved = client.patch(
        f"/api/v1/admin/reports/{report_id}",
        headers=headers,
        json={"status": "resolved", "resolution_note": "Reviewed"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"


def test_seed_creates_ten_accounts_with_ten_posts_and_is_idempotent(monkeypatch):
    monkeypatch.setattr(seed, "SessionLocal", TestingSession)

    seed.run()
    seed.run()

    with TestingSession() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 10
        assert db.scalar(select(func.count()).select_from(Post)) == 100
        assert db.scalar(select(func.count()).select_from(Reply)) == 20
        assert db.scalar(select(func.count()).select_from(Repost)) == 20
