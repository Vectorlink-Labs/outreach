"""Mounts all v1 routes under /v1."""

from __future__ import annotations

from fastapi import APIRouter

from outreach.api.v1 import health, products

router = APIRouter(prefix="/v1")

router.include_router(health.router)
router.include_router(products.router)

# briefs, plans, runs, results, replies, exports and events join here as
# they are built.
