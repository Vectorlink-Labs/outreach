"""Pydantic contracts for products. The shared vocabulary between layers."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from outreach.db.models.product import CrawlMode, CrawlState


class ProductCreate(BaseModel):
    """Body of POST /api/v1/products. Exactly what the user typed."""

    name: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=3, max_length=2048)


class ProductPageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    title: str | None
    word_count: int
    is_thin: bool
    order_index: int
    fetched_at: datetime


class ProductOut(BaseModel):
    """
    Everything except the markdown.

    The combined document can be hundreds of kilobytes, so it has its own
    endpoint rather than riding along on every status poll.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    input_url: str
    canonical_url: str
    domain: str

    mode: CrawlMode | None
    state: CrawlState
    docs_root: str | None

    page_count: int
    word_count: int
    bytes_fetched: int
    truncated: bool
    stop_reason: str | None
    failure_reason: str | None
    content_hash: str | None

    crawl_started_at: datetime | None
    crawl_finished_at: datetime | None
    created_at: datetime


class ProductDetail(ProductOut):
    pages: list[ProductPageOut] = []
