from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status

from app.core.config import Settings
from app.models.schemas import StudentPrincipal


def create_access_token(principal: StudentPrincipal, settings: Settings) -> tuple[str, int]:
    ttl_seconds = settings.token_ttl_minutes * 60
    now = datetime.now(timezone.utc)
    claims = {
        "sub": principal.subject,
        "sid": principal.student_id,
        "name": principal.display_name,
        "email": principal.email,
        "roles": principal.roles,
        "iss": settings.public_base_url,
        "aud": "su-assistant-clients",
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
    }
    token = jwt.encode(claims, settings.jwt_secret, algorithm="HS256")
    return token, ttl_seconds


def decode_access_token(token: str, settings: Settings) -> StudentPrincipal:
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience="su-assistant-clients",
            issuer=settings.public_base_url,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired access token") from exc
    return StudentPrincipal(
        subject=claims["sub"],
        student_id=claims.get("sid"),
        display_name=claims.get("name"),
        email=claims.get("email"),
        roles=claims.get("roles", []),
    )
