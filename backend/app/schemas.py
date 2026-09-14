import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, model_validator

from app.models import NotificationType, ReportStatus, UserRole, UserStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    message: str


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    login: str = Field(min_length=3, max_length=320)
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=500)
    username: str | None = Field(default=None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")
    ai_assistant_enabled: bool | None = None
    google_api_key: SecretStr | None = Field(default=None, max_length=500)


class UserSummary(ORMModel):
    id: uuid.UUID
    username: str
    display_name: str
    avatar_url: str | None
    is_verified: bool


class UserPublic(UserSummary):
    bio: str | None
    website: str | None
    role: UserRole
    status: UserStatus
    created_at: datetime
    followers_count: int = 0
    following_count: int = 0
    posts_count: int = 0
    replies_count: int = 0
    reposts_count: int = 0
    is_following: bool = False


class UserMe(UserPublic):
    email: EmailStr
    ai_assistant_enabled: bool = False
    has_google_api_key: bool = False


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserMe


class MediaOut(ORMModel):
    id: uuid.UUID
    url: str
    mime_type: str
    size_bytes: int
    created_at: datetime


class PostCreate(BaseModel):
    content: str = Field(default="", max_length=500)
    media_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def content_or_media(self):
        if not self.content.strip() and not self.media_ids:
            raise ValueError("A post needs text or media")
        return self


class PostUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class PostOut(ORMModel):
    id: uuid.UUID
    content: str
    author: UserSummary
    media: list[MediaOut] = []
    created_at: datetime
    updated_at: datetime
    likes_count: int = 0
    replies_count: int = 0
    reposts_count: int = 0
    liked: bool = False
    reposted: bool = False
    bookmarked: bool = False


class ReplyCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class ReplyOut(ORMModel):
    id: uuid.UUID
    post_id: uuid.UUID
    content: str
    author: UserSummary
    created_at: datetime
    updated_at: datetime


class UserList(BaseModel):
    items: list[UserPublic]
    total: int
    offset: int
    limit: int


class PostList(BaseModel):
    items: list[PostOut]
    total: int
    offset: int
    limit: int


class ReplyList(BaseModel):
    items: list[ReplyOut]
    total: int
    offset: int
    limit: int


class ProfileReplyOut(ReplyOut):
    post: PostOut


class ProfileReplyList(BaseModel):
    items: list[ProfileReplyOut]
    total: int
    offset: int
    limit: int


class NotificationOut(ORMModel):
    id: uuid.UUID
    actor: UserSummary | None
    type: NotificationType
    message: str
    post_id: uuid.UUID | None
    is_read: bool
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread_count: int
    offset: int
    limit: int


class ReportCreate(BaseModel):
    post_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    reason: str = Field(min_length=3, max_length=80)
    details: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def exactly_one_target(self):
        if (self.post_id is None) == (self.user_id is None):
            raise ValueError("Choose exactly one report target")
        return self


class ReportModerate(BaseModel):
    status: ReportStatus
    resolution_note: str | None = Field(default=None, max_length=2000)


class ReportOut(ORMModel):
    id: uuid.UUID
    reporter_id: uuid.UUID
    post_id: uuid.UUID | None
    user_id: uuid.UUID | None
    reason: str
    details: str | None
    status: ReportStatus
    moderator_id: uuid.UUID | None
    resolution_note: str | None
    created_at: datetime
    updated_at: datetime


class ReportList(BaseModel):
    items: list[ReportOut]
    total: int
    offset: int
    limit: int


class AdminUserAction(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class Health(BaseModel):
    status: str
    database: str


class AIWritingRequest(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    action: Literal["rewrite", "spellcheck", "shorten", "tone"]
    tone: str | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def tone_is_required_for_tone_action(self):
        if self.action == "tone" and not (self.tone and self.tone.strip()):
            raise ValueError("Tone is required when action is tone")
        return self


class AIPostQuestionRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class AIImageCaptionRequest(BaseModel):
    media_id: uuid.UUID


class AISource(BaseModel):
    title: str
    url: str


class AIAssistantResponse(BaseModel):
    content: str
    sources: list[AISource] = Field(default_factory=list)
    disclaimer: str | None = None
