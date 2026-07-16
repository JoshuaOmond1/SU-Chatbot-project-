from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class RetrievedChunk:
    id: UUID
    title: str
    content: str
    source_url: str | None
    section: str | None
    score: float


class Retriever(Protocol):
    async def search(
        self, embedding: list[float], audience: str = "student"
    ) -> list[RetrievedChunk]: ...


class EmptyRetriever:
    async def search(
        self, embedding: list[float], audience: str = "student"
    ) -> list[RetrievedChunk]:
        return []


class CloudSqlRetriever:
    """Vector search over approved Firebase SQL Connect knowledge records."""

    def __init__(self, database, limit: int = 6):
        self.database = database
        self.limit = limit

    async def search(
        self, embedding: list[float], audience: str = "student"
    ) -> list[RetrievedChunk]:
        vector = "[" + ",".join(str(value) for value in embedding) + "]"
        query = """
            SELECT kc.id, ks.title, kc.content, ks.canonical_url, kc.section,
                   1 - (kc.content_embedding <=> $1::vector) AS score
              FROM knowledge_chunks kc
              JOIN knowledge_sources ks ON ks.id = kc.source_id
             WHERE kc.is_active = TRUE
               AND ks.is_active = TRUE
               AND ks.approval_status = 'approved'
               AND ks.audience IN ($2, 'all')
               AND kc.content_embedding IS NOT NULL
             ORDER BY kc.content_embedding <=> $1::vector
             LIMIT $3
        """
        async with self.database.connection() as connection:
            rows = await connection.fetch(query, vector, audience, self.limit)
        return [
            RetrievedChunk(
                id=row["id"],
                title=row["title"],
                content=row["content"],
                source_url=row["canonical_url"],
                section=row["section"],
                score=float(row["score"]),
            )
            for row in rows
        ]
