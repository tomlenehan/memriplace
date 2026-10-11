import secrets
import warnings
from typing import Annotated, Any, Literal

from pydantic import (
    AnyUrl,
    BeforeValidator,
    HttpUrl,
    computed_field,
    model_validator,
)
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return f"postgresql+psycopg://{url.removeprefix('postgres://')}"
    if url.startswith("postgresql://"):
        return f"postgresql+psycopg://{url.removeprefix('postgresql://')}"
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore"
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    DOMAIN: str = "localhost"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    @computed_field  # type: ignore[misc]
    @property
    def server_host(self) -> str:
        # Use HTTPS for anything other than local development
        if self.ENVIRONMENT == "local":
            return f"http://{self.DOMAIN}"
        return f"https://{self.DOMAIN}"

    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    PROJECT_NAME: str
    SENTRY_DSN: HttpUrl | None = None
    OPENAI_API_KEY: str | None = None
    TYPESAFE_API_KEY: str | None = None
    TYPESAFE_MODEL: str = "jev-latest"
    GOOGLE_CLIENT_ID: str | None = None
    STORY_READINESS_MODEL: str = "gpt-4o-mini"
    OPENAI_REALTIME_MODEL: str = "gpt-realtime-2.1"
    OPENAI_REALTIME_VOICE: str = "marin"
    OPENAI_NARRATION_REALTIME_MODEL: str = "gpt-realtime-2.1-mini"
    OPENAI_NARRATION_VOICE: str = "marin"
    OPENAI_TRANSCRIPTION_MODEL: str = "gpt-transcribe"
    PUBLIC_SKY_ENABLED: bool = False
    MEMBERSHIPS_ENABLED: bool = False
    # LangSmith is opt-in because its traces can include private story content.
    # LANGCHAIN_* remains supported for the older LangChain packages in this app.
    LANGSMITH_API_KEY: str | None = None
    LANGSMITH_TRACING: bool | None = None
    LANGSMITH_ENDPOINT: str | None = None
    LANGSMITH_PROJECT: str | None = None
    LANGCHAIN_API_KEY: str | None = None
    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_ENDPOINT: str | None = None
    LANGCHAIN_PROJECT: str | None = None
    DATABASE_URL: str | None = None
    POSTGRES_SERVER: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "app"

    @computed_field  # type: ignore[misc]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            return normalize_database_url(self.DATABASE_URL)

        return str(
            MultiHostUrl.build(
                scheme="postgresql+psycopg",
                username=self.POSTGRES_USER,
                password=self.POSTGRES_PASSWORD,
                host=self.POSTGRES_SERVER,
                port=self.POSTGRES_PORT,
                path=self.POSTGRES_DB,
            )
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    # TODO: update type to EmailStr when sqlmodel supports it
    EMAILS_FROM_EMAIL: str | None = None
    EMAILS_FROM_NAME: str | None = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[misc]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    @property
    def langsmith_tracing_enabled(self) -> bool:
        if self.LANGSMITH_TRACING is not None:
            return self.LANGSMITH_TRACING
        return self.LANGCHAIN_TRACING_V2

    @property
    def langsmith_api_key(self) -> str | None:
        return self.LANGSMITH_API_KEY or self.LANGCHAIN_API_KEY

    @property
    def langsmith_endpoint(self) -> str | None:
        return self.LANGSMITH_ENDPOINT or self.LANGCHAIN_ENDPOINT

    @property
    def langsmith_project(self) -> str:
        return self.LANGSMITH_PROJECT or self.LANGCHAIN_PROJECT or "memriplace"

    # TODO: update type to EmailStr when sqlmodel supports it
    EMAIL_TEST_USER: str = "test@example.com"
    # TODO: update type to EmailStr when sqlmodel supports it
    FIRST_SUPERUSER: str
    FIRST_SUPERUSER_PASSWORD: str
    USERS_OPEN_REGISTRATION: bool = False

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )

        return self


settings = Settings()  # type: ignore
