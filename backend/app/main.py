from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.db.cloud_sql import CloudSqlDatabase
from app.integrations.ams import AmsGateway
from app.rag.retriever import CloudSqlRetriever, EmptyRetriever
from app.services.ai import (
    CompositeAiProvider,
    DevelopmentAiProvider,
    OpenAiProvider,
    VertexEmbeddingProvider,
)
from app.services.chat import ChatService
from app.services.repository import CloudSqlSessionRepository, InMemorySessionRepository


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.http = httpx.AsyncClient()
    app.state.database = None
    if settings.use_database:
        if not settings.cloud_sql_instance or not settings.database_iam_user:
            raise RuntimeError(
                "CLOUD_SQL_INSTANCE and DATABASE_IAM_USER are required when USE_DATABASE=true"
            )
        database = CloudSqlDatabase(
            settings.cloud_sql_instance,
            settings.database_name,
            settings.database_iam_user,
        )
        app.state.database = database
        app.state.sessions = CloudSqlSessionRepository(database)
        retriever = CloudSqlRetriever(database, settings.max_context_chunks)
    else:
        app.state.sessions = InMemorySessionRepository()
        retriever = EmptyRetriever()
    answerer = (
        OpenAiProvider(settings)
        if settings.openai_api_key
        else DevelopmentAiProvider(settings.embedding_dimensions)
    )
    ai = answerer
    if settings.use_database:
        ai = CompositeAiProvider(
            VertexEmbeddingProvider(settings, app.state.http),
            answerer,
        )
    app.state.chat_service = ChatService(
        sessions=app.state.sessions,
        ai=ai,
        retriever=retriever,
        ams=AmsGateway(settings, app.state.http),
    )
    yield
    await app.state.http.aclose()
    if app.state.database:
        await app.state.database.close()


settings = get_settings()
app = FastAPI(
    title="SU Student Assistant API",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(router)
