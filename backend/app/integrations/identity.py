import asyncio
import xml.etree.ElementTree as ET

import httpx
import jwt

from app.core.config import Settings
from app.models.schemas import StudentPrincipal


class IdentityError(ValueError):
    pass


class IdentityGateway:
    """Validates one-time CAS tickets or institution-issued OIDC access tokens."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def exchange(self, provider: str, credential: str) -> StudentPrincipal:
        if provider == "cas":
            return await self._validate_cas_ticket(credential)
        if provider == "oidc":
            return await self._validate_oidc_token(credential)
        raise IdentityError("Unsupported identity provider")

    async def _validate_cas_ticket(self, ticket: str) -> StudentPrincipal:
        if not self.settings.cas_validate_url or not self.settings.cas_service_url:
            raise IdentityError("CAS is not configured")
        response = await self.http.get(
            self.settings.cas_validate_url,
            params={"ticket": ticket, "service": self.settings.cas_service_url},
            timeout=8,
        )
        response.raise_for_status()
        root = ET.fromstring(response.text)
        namespace = {"cas": "http://www.yale.edu/tp/cas"}
        success = root.find("cas:authenticationSuccess", namespace)
        if success is None:
            raise IdentityError("CAS rejected the ticket")
        user = success.findtext("cas:user", namespaces=namespace)
        attributes = success.find("cas:attributes", namespace)

        def attr(name: str) -> str | None:
            return attributes.findtext(f"cas:{name}", namespaces=namespace) if attributes else None

        if not user:
            raise IdentityError("CAS response did not contain a subject")
        return StudentPrincipal(
            subject=user,
            student_id=attr("studentId"),
            display_name=attr("displayName"),
            email=attr("mail"),
            roles=["student"],
        )

    async def _validate_oidc_token(self, token: str) -> StudentPrincipal:
        if not self.settings.oidc_jwks_url:
            raise IdentityError("OIDC is not configured")
        jwks_client = jwt.PyJWKClient(self.settings.oidc_jwks_url)
        signing_key = await asyncio.to_thread(jwks_client.get_signing_key_from_jwt, token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=self.settings.oidc_audience,
            issuer=self.settings.oidc_issuer or None,
        )
        return StudentPrincipal(
            subject=claims["sub"],
            student_id=claims.get("student_id"),
            display_name=claims.get("name"),
            email=claims.get("email"),
            roles=claims.get("roles", ["student"]),
        )
