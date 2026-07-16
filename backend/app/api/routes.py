from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status

from app.api.dependencies import current_principal, get_chat_service, get_repository
from app.core.config import Settings, get_settings
from app.core.security import create_access_token, decode_access_token
from app.integrations.identity import IdentityError, IdentityGateway
from app.models.schemas import (
    ChatResponse,
    ChatSession,
    CreateSessionRequest,
    HealthResponse,
    SendMessageRequest,
    StudentPrincipal,
    TokenExchangeRequest,
    TokenResponse,
)
from app.services.chat import ChatService
from app.services.repository import SessionRepository

router = APIRouter(prefix="/v1")


@router.get("/health", response_model=HealthResponse, tags=["operations"])
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/auth/exchange", response_model=TokenResponse, tags=["authentication"])
async def exchange_token(
    payload: TokenExchangeRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    gateway = IdentityGateway(settings, request.app.state.http)
    try:
        principal = await gateway.exchange(payload.provider, payload.credential)
    except (IdentityError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    token, expires_in = create_access_token(principal, settings)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/sessions", response_model=ChatSession, status_code=201, tags=["chat"])
async def create_session(
    payload: CreateSessionRequest,
    principal: StudentPrincipal = Depends(current_principal),
    repository: SessionRepository = Depends(get_repository),
) -> ChatSession:
    session = ChatSession(id=payload.client_session_id, owner_subject=principal.subject) if payload.client_session_id else ChatSession(owner_subject=principal.subject)
    existing = await repository.get(session.id, principal.subject)
    return existing or await repository.create(session)


@router.get("/sessions/{session_id}", response_model=ChatSession, tags=["chat"])
async def get_session(
    session_id: UUID,
    principal: StudentPrincipal = Depends(current_principal),
    repository: SessionRepository = Depends(get_repository),
) -> ChatSession:
    session = await repository.get(session_id, principal.subject)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session


@router.post("/sessions/{session_id}/messages", response_model=ChatResponse, tags=["chat"])
async def send_message(
    session_id: UUID,
    payload: SendMessageRequest,
    principal: StudentPrincipal = Depends(current_principal),
    service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    try:
        message = await service.send(session_id, payload.content, principal)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found") from exc
    return ChatResponse(session_id=session_id, message=message)


@router.websocket("/ws/sessions/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: UUID) -> None:
    # WebSocket browser APIs cannot set Authorization headers. Use a short-lived token
    # in Sec-WebSocket-Protocol, never in the URL (URLs are commonly logged).
    settings = get_settings()
    origin = websocket.headers.get("origin")
    if origin not in settings.allowed_origins:
        await websocket.close(code=4403)
        return
    protocols = websocket.headers.get("sec-websocket-protocol", "").split(",")
    values = [item.strip() for item in protocols]
    if len(values) != 2 or values[0] != "su-chat" or not values[1].startswith("bearer."):
        await websocket.close(code=4401)
        return
    try:
        principal = decode_access_token(values[1].removeprefix("bearer."), settings)
    except HTTPException:
        await websocket.close(code=4401)
        return
    await websocket.accept(subprotocol="su-chat")
    service: ChatService = websocket.app.state.chat_service
    try:
        while True:
            payload = SendMessageRequest.model_validate(await websocket.receive_json())
            message = await service.send(session_id, payload.content, principal)
            await websocket.send_json(ChatResponse(session_id=session_id, message=message).model_dump(mode="json"))
    except KeyError:
        await websocket.close(code=4404)
    except WebSocketDisconnect:
        return
