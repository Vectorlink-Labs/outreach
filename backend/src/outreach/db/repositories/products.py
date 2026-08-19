"""All SQL for products lives here. Nothing above this layer writes SQL."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from outreach.db.models.product import Product, ProductPage


async def get(session: AsyncSession, product_id: uuid.UUID) -> Product | None:
    return await session.get(Product, product_id)


async def get_with_pages(session: AsyncSession, product_id: uuid.UUID) -> Product | None:
    stmt = (
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.pages))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_by_domain(session: AsyncSession, domain: str) -> Product | None:
    stmt = select(Product).where(Product.domain == domain)
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_all(session: AsyncSession, limit: int = 50) -> list[Product]:
    stmt = select(Product).order_by(Product.created_at.desc()).limit(limit)
    return list((await session.execute(stmt)).scalars())


async def add(session: AsyncSession, product: Product) -> Product:
    session.add(product)
    await session.flush()
    return product


async def clear_pages(session: AsyncSession, product_id: uuid.UUID) -> None:
    """Called before a re-crawl so a shrinking site does not leave orphans."""
    await session.execute(delete(ProductPage).where(ProductPage.product_id == product_id))


async def add_pages(session: AsyncSession, pages: list[ProductPage]) -> None:
    session.add_all(pages)
    await session.flush()
