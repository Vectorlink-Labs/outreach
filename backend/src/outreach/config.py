"""Settings via pydantic-settings. All env vars declared here, nowhere else."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- app -------------------------------------------------------------
    app_env: str = "local"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173"

    # ---- accounts --------------------------------------------------------
    #: Signs session cookies. Changing it logs everybody out, which is the
    #: intended emergency lever. MUST be set to something random in
    #: production: the default below is public knowledge.
    secret_key: str = "dev-only-not-a-secret-change-me"
    session_days: int = Field(default=30, ge=1)
    #: Send the cookie over https only. False locally because dev is http.
    cookie_secure: bool = False

    # ---- database --------------------------------------------------------
    database_url: str = "postgresql+asyncpg://outreach:outreach@localhost:5432/outreach"
    db_echo: bool = False

    #: Create the database if it is missing and apply migrations at startup.
    #: On for local development so a new person runs one command. Must be
    #: OFF in production: two instances starting together would migrate at
    #: the same time, and a bad migration should fail a deploy, not the app.
    auto_migrate: bool = True

    # ---- sources ---------------------------------------------------------
    #: A fine-grained token with NO scopes is enough - public data only. It
    #: raises the search limit from 10 requests per minute to 30, which is
    #: the difference between a usable run and a useless one.
    github_token: str = ""

    # ---- ranking ---------------------------------------------------------
    openai_api_key: str = ""
    #: 1536 dimensions, and cheap enough that ranking a few hundred results
    #: costs a fraction of a cent.
    embedding_model: str = "text-embedding-3-small"
    #: Reads one post and judges intent. A small, cheap model is enough:
    #: this is classification against a rubric, not reasoning.
    llm_model: str = "gpt-4o-mini"

    #: Per source, per run. Not a target: a ceiling, so one run cannot spend
    #: the whole organisation's rate limit.
    source_max_requests: int = Field(default=40, ge=1)
    source_max_items: int = Field(default=1000, ge=1)
    source_max_seconds: float = Field(default=90.0, ge=5.0)

    # ---- crawling --------------------------------------------------------
    user_agent: str = "OutreachBot/0.1 (+https://vectorlinklabs.com/bot)"
    http_timeout_seconds: float = 20.0

    crawl_max_pages: int = Field(default=500, ge=1)
    crawl_max_seconds: int = Field(default=900, ge=10)
    crawl_max_bytes: int = Field(default=100_000_000, ge=1_000)
    crawl_delay_seconds: float = Field(default=0.5, ge=0.0)
    thin_page_words: int = Field(default=120, ge=0)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
