"""FastAPI application. Wiring only, no business logic."""

from __future__ import annotations

import logging

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from outreach.api.v1.router import router as v1_router
from outreach.config import settings

logging.basicConfig(level=settings.log_level)
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.log_level)
    ),
)

app = FastAPI(
    title="Outreach",
    version="0.1.0",
    description=(
        "Finds public developer conversations where someone has the problem "
        "our product solves."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Final paths are /api/v1/...
app.include_router(v1_router, prefix="/api")


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": "outreach", "docs": "/docs", "api": "/api/v1"}
