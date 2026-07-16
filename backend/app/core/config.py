from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    public_base_url: str = "http://localhost:8000"
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    jwt_secret: str = "development-only-secret-change-before-deploy"
    token_ttl_minutes: int = 15
    database_url: str = "postgresql://localhost/su_assistant"
    use_database: bool = False
    cloud_sql_instance: str = ""
    database_name: str = "su_assistant"
    database_iam_user: str = ""

    openai_api_key: str = ""
    openai_chat_model: str = "gpt-5.6-luna"
    openai_embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 768
    vertex_project_id: str = ""
    vertex_location: str = "me-west1"
    vertex_embedding_model: str = "text-embedding-005"

    cas_validate_url: str = ""
    cas_service_url: str = ""
    oidc_issuer: str = ""
    oidc_audience: str = "su-assistant"
    oidc_jwks_url: str = ""
    ams_base_url: str = ""
    ams_client_id: str = ""
    ams_client_secret: str = ""
    service_token_encryption_key: str = ""

    max_context_chunks: int = Field(default=6, ge=1, le=12)
    max_history_messages: int = Field(default=12, ge=2, le=30)

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
