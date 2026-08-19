"""FastAPI dependencies: db session, redis, current user, tenant scope."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from outreach.db.session import SessionFactory


async def get_session() -> AsyncIterator[AsyncSession]:
    """One session per request. Commits on success, rolls back on failure."""
    session = SessionFactory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


DbSession = Annotated[AsyncSession, Depends(get_session)]

# redis, current_user and tenant scope arrive with their own phases.
