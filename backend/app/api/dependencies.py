from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.core.config import Settings, get_settings
from app.core.security import decode_access_token
from app.models.schemas import StudentPrincipal
from app.services.chat import ChatService
from app.services.repository import SessionRepository


def get_repository(request: Request) -> SessionRepository:
    return request.app.state.sessions


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


def current_principal(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> StudentPrincipal:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bearer token required")
    return decode_access_token(authorization.removeprefix("Bearer ").strip(), settings)
