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

    # ---- database --------------------------------------------------------
    database_url: str = "postgresql+asyncpg://outreach:outreach@localhost:5432/outreach"
    db_echo: bool = False

    #: Create the database if it is missing and apply migrations at startup.
    #: On for local development so a new person runs one command. Must be
    #: OFF in production: two instances starting together would migrate at
    #: the same time, and a bad migration should fail a deploy, not the app.
    auto_migrate: bool = True

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
