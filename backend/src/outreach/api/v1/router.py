"""Mounts all v1 routes under /v1."""

from __future__ import annotations

from fastapi import APIRouter

from outreach.api.v1 import auth, flow, health, opportunities, products, sources

router = APIRouter(prefix="/v1")

router.include_router(health.router)
router.include_router(auth.router)
router.include_router(products.router)
router.include_router(opportunities.router)
router.include_router(sources.router)
router.include_router(flow.router)

# briefs, plans, runs, results, replies, exports and events join here as
# they are built.
