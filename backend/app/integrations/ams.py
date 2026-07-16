from typing import Any

import httpx

from app.core.config import Settings
from app.models.schemas import StudentPrincipal


class AmsGateway:
    """Narrow, read-only anti-corruption layer around AMS.

    Replace paths and response mapping with the university's published AMS contract.
    Never expose the service credential or unrestricted AMS payloads to a model.
    """

    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def student_snapshot(self, principal: StudentPrincipal) -> dict[str, Any]:
        if not self.settings.ams_base_url or not principal.student_id:
            return {}
        token = await self._service_token()
        response = await self.http.get(
            f"{self.settings.ams_base_url}/v1/students/{principal.student_id}/assistant-summary",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        # Explicit allow-list prevents accidental disclosure of sensitive AMS fields.
        return {
            key: data[key]
            for key in ("programme", "year_of_study", "registration_status", "fee_balance_band")
            if key in data
        }

    async def _service_token(self) -> str:
        response = await self.http.post(
            f"{self.settings.ams_base_url}/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.settings.ams_client_id,
                "client_secret": self.settings.ams_client_secret,
                "scope": "assistant.summary.read",
            },
            timeout=5,
        )
        response.raise_for_status()
        return response.json()["access_token"]
