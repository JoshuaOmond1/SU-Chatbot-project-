from uuid import UUID

from app.integrations.ams import AmsGateway
from app.models.schemas import Citation, ChatMessage, Role, StudentPrincipal
from app.rag.retriever import Retriever
from app.services.ai import AiProvider
from app.services.repository import SessionRepository


class ChatService:
    def __init__(
        self,
        sessions: SessionRepository,
        ai: AiProvider,
        retriever: Retriever,
        ams: AmsGateway,
    ):
        self.sessions = sessions
        self.ai = ai
        self.retriever = retriever
        self.ams = ams

    async def send(self, session_id: UUID, content: str, principal: StudentPrincipal) -> ChatMessage:
        session = await self.sessions.get(session_id, principal.subject)
        if not session:
            raise KeyError(session_id)

        user_message = ChatMessage(role=Role.USER, content=content.strip())
        embedding = await self.ai.embed(content)
        chunks = await self.retriever.search(embedding)
        snapshot = await self.ams.student_snapshot(principal)
        answer = await self.ai.answer(content, session.messages, chunks, snapshot)
        citations = [
            Citation(
                id=chunk.id,
                title=chunk.title,
                source_url=chunk.source_url,
                section=chunk.section,
            )
            for chunk in chunks
        ]
        assistant_message = ChatMessage(
            role=Role.ASSISTANT,
            content=answer,
            citations=citations,
        )
        await self.sessions.append(session_id, principal.subject, user_message, assistant_message)
        return assistant_message
