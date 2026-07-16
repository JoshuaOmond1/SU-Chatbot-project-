from abc import ABC, abstractmethod
from datetime import datetime, timezone
import json
from uuid import UUID

from app.models.schemas import ChatMessage, ChatSession


class SessionRepository(ABC):
    @abstractmethod
    async def create(self, session: ChatSession) -> ChatSession: ...

    @abstractmethod
    async def get(self, session_id: UUID, owner_subject: str) -> ChatSession | None: ...

    @abstractmethod
    async def append(
        self, session_id: UUID, owner_subject: str, *messages: ChatMessage
    ) -> ChatSession: ...


class InMemorySessionRepository(SessionRepository):
    """Development/test repository. Production uses the Cloud SQL adapter."""

    def __init__(self) -> None:
        self.sessions: dict[UUID, ChatSession] = {}

    async def create(self, session: ChatSession) -> ChatSession:
        self.sessions[session.id] = session
        return session

    async def get(self, session_id: UUID, owner_subject: str) -> ChatSession | None:
        session = self.sessions.get(session_id)
        return session if session and session.owner_subject == owner_subject else None

    async def append(
        self, session_id: UUID, owner_subject: str, *messages: ChatMessage
    ) -> ChatSession:
        session = await self.get(session_id, owner_subject)
        if not session:
            raise KeyError(session_id)
        session.messages.extend(messages)
        session.updated_at = datetime.now(timezone.utc)
        return session


class CloudSqlSessionRepository(SessionRepository):
    """Passwordless adapter for the schema managed by Firebase SQL Connect."""

    def __init__(self, database):
        self.database = database

    async def create(self, session: ChatSession) -> ChatSession:
        async with self.database.connection() as connection:
            await connection.execute(
                "INSERT INTO chat_sessions (id, owner_subject, created_at, updated_at) "
                "VALUES ($1, $2, $3, $4)",
                session.id,
                session.owner_subject,
                session.created_at,
                session.updated_at,
            )
        return session

    async def get(self, session_id: UUID, owner_subject: str) -> ChatSession | None:
        async with self.database.connection() as connection:
            session_row = await connection.fetchrow(
                "SELECT id, owner_subject, created_at, updated_at FROM chat_sessions "
                "WHERE id = $1 AND owner_subject = $2",
                session_id,
                owner_subject,
            )
            if not session_row:
                return None
            message_rows = await connection.fetch(
                "SELECT id, role, content, created_at, citations_json FROM chat_messages "
                "WHERE session_id = $1 ORDER BY created_at",
                session_id,
            )
        messages = [
            ChatMessage(
                id=row["id"],
                role=row["role"],
                content=row["content"],
                created_at=row["created_at"],
                citations=json.loads(row["citations_json"] or "[]"),
            )
            for row in message_rows
        ]
        return ChatSession(
            id=session_row["id"],
            owner_subject=session_row["owner_subject"],
            created_at=session_row["created_at"],
            updated_at=session_row["updated_at"],
            messages=messages,
        )

    async def append(
        self, session_id: UUID, owner_subject: str, *messages: ChatMessage
    ) -> ChatSession:
        async with self.database.connection() as connection:
            async with connection.transaction():
                exists = await connection.fetchval(
                    "SELECT 1 FROM chat_sessions WHERE id = $1 AND owner_subject = $2 FOR UPDATE",
                    session_id,
                    owner_subject,
                )
                if not exists:
                    raise KeyError(session_id)
                for message in messages:
                    await connection.execute(
                        "INSERT INTO chat_messages "
                        "(id, session_id, role, content, citations_json, created_at) "
                        "VALUES ($1, $2, $3, $4, $5, $6)",
                        message.id,
                        session_id,
                        message.role.value,
                        message.content,
                        json.dumps(
                            [item.model_dump(mode="json") for item in message.citations]
                        ),
                        message.created_at,
                    )
                await connection.execute(
                    "UPDATE chat_sessions SET updated_at = now() WHERE id = $1",
                    session_id,
                )
        session = await self.get(session_id, owner_subject)
        if not session:
            raise KeyError(session_id)
        return session
