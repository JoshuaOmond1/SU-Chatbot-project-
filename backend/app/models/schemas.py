from datetime import datetime, timezone
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Role(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class StudentPrincipal(BaseModel):
    subject: str
    student_id: str | None = None
    display_name: str | None = None
    email: str | None = None
    roles: list[str] = Field(default_factory=list)


class TokenExchangeRequest(BaseModel):
    provider: str = Field(pattern="^(cas|oidc)$")
    credential: str = Field(min_length=8, max_length=8192)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class Citation(BaseModel):
    id: UUID
    title: str
    source_url: str | None = None
    section: str | None = None


class ChatMessage(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    role: Role
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    citations: list[Citation] = Field(default_factory=list)


class CreateSessionRequest(BaseModel):
    client_session_id: UUID | None = None


class ChatSession(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    owner_subject: str
    messages: list[ChatMessage] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    session_id: UUID
    message: ChatMessage


class HealthResponse(BaseModel):
    status: str
    service: str = "su-assistant-api"
