"""Validated knowledge ingestion CLI.

Usage: python -m app.rag.ingest path/to/policy.md --title "Fees policy" --url https://...
Only approved, text-based source exports should enter this pipeline. Keep the
original document in the university DMS and pass its canonical URL here.
"""

import argparse
import asyncio
import hashlib
from pathlib import Path
from uuid import uuid4

import httpx

from app.core.config import get_settings
from app.db.cloud_sql import CloudSqlDatabase
from app.services.ai import VertexEmbeddingProvider


def chunks(text: str, size: int = 1200, overlap: int = 150) -> list[str]:
    paragraphs = [part.strip() for part in text.replace("\r\n", "\n").split("\n\n") if part.strip()]
    result: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if current and len(current) + len(paragraph) > size:
            result.append(current)
            prefix = current[-overlap:] + "\n\n" if overlap else ""
            current = prefix + paragraph
        else:
            current = f"{current}\n\n{paragraph}".strip()
    if current:
        result.append(current)
    return result


async def ingest(
    path: Path,
    title: str,
    url: str | None,
    audience: str,
    domain: str,
    owner_office: str,
) -> None:
    settings = get_settings()
    if not settings.cloud_sql_instance or not settings.database_iam_user:
        raise RuntimeError("Cloud SQL connection settings are required for ingestion")
    text = path.read_text(encoding="utf-8")
    source_id = uuid4()
    database = CloudSqlDatabase(
        settings.cloud_sql_instance,
        settings.database_name,
        settings.database_iam_user,
    )
    http = httpx.AsyncClient()
    embedder = VertexEmbeddingProvider(settings, http)
    try:
        async with database.connection() as connection:
            await connection.execute(
                """INSERT INTO knowledge_sources
                   (id, title, canonical_url, domain, owner_office, audience,
                    approval_status, is_active, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, 'draft', false, now(), now())""",
                source_id,
                title,
                url,
                domain,
                owner_office,
                audience,
            )
            for content in chunks(text):
                embedding = await embedder.embed(content)
                vector = "[" + ",".join(str(value) for value in embedding) + "]"
                checksum = hashlib.sha256(content.encode()).hexdigest()
                await connection.execute(
                    """INSERT INTO knowledge_chunks
                       (id, source_id, content, content_embedding, checksum,
                        is_active, created_at, updated_at)
                       VALUES ($1, $2, $3, $4::vector, $5, false, now(), now())""",
                    uuid4(),
                    source_id,
                    content,
                    vector,
                    checksum,
                )
    finally:
        await http.aclose()
        await database.close()
    print(f"Created draft source {source_id} from {path}; review it before activation")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--title", required=True)
    parser.add_argument("--url")
    parser.add_argument("--audience", default="student")
    parser.add_argument("--domain", required=True, help="fees, academic, administrative, or support")
    parser.add_argument("--owner-office", required=True)
    args = parser.parse_args()
    asyncio.run(
        ingest(
            args.path,
            args.title,
            args.url,
            args.audience,
            args.domain,
            args.owner_office,
        )
    )


if __name__ == "__main__":
    main()
