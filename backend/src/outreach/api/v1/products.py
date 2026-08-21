"""Products, scoped to the signed-in account."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, Response, status

from outreach.api.deps import CurrentUser, DbSession
from outreach.db.models.product import CrawlState
from outreach.db.repositories import products as repo
from outreach.schemas.product import ProductCreate, ProductDetail, ProductOut
from outreach.services import product_service

router = APIRouter(prefix="/products", tags=["products"])

#: Same message whether the product does not exist or belongs to somebody
#: else. Telling the two apart hands out a way to probe for other people's ids.
NOT_FOUND = "No product with that id."


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    user: CurrentUser,
    session: DbSession,
    background: BackgroundTasks,
    response: Response,
) -> ProductOut:
    """
    Register a product and start reading its website.

    Returns immediately. The crawl runs in the background because it takes
    anywhere from ten seconds to a few minutes, and nobody should watch a
    spinner for that long.

    **201** a new product, and the crawl has started.
    **200** this account already had that domain, and nothing was re-read.
    """
    try:
        product, created = await product_service.get_or_create(session, payload, user.id)
    except product_service.ProductError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    await session.commit()

    if created:
        background.add_task(product_service.run_crawl, product.id)
    else:
        response.status_code = status.HTTP_200_OK

    return ProductOut.model_validate(product)


@router.get("", response_model=list[ProductOut])
async def list_products(user: CurrentUser, session: DbSession) -> list[ProductOut]:
    """Everything this account owns, newest first. Feeds the product picker."""
    rows = await repo.list_for_user(session, user.id)
    return [ProductOut.model_validate(row) for row in rows]


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(
    product_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ProductDetail:
    """Status and the page list. Poll this while the crawl is running."""
    product = await repo.get_owned_with_pages(session, product_id, user.id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return ProductDetail.model_validate(product)


@router.get("/{product_id}/markdown", response_class=Response)
async def get_markdown(
    product_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> Response:
    """
    The combined document, as a markdown file.

    This is the single file that later gets handed to the model so it
    understands what the product is and what it solves.
    """
    product = await repo.get_owned(session, product_id, user.id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    if not product.markdown:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Nothing has been read yet. The crawl is {product.state.value}.",
        )

    filename = f"{product.domain.replace('.', '-')}.md"
    return Response(
        content=product.markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> None:
    """
    Forget a product and everything we read for it.

    Its pages go with it, because product_page is declared ON DELETE CASCADE.
    """
    product = await repo.get_owned(session, product_id, user.id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    await session.delete(product)


@router.post("/{product_id}/recrawl", response_model=ProductOut)
async def recrawl_product(
    product_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    background: BackgroundTasks,
) -> ProductOut:
    """
    Read the website again.

    The only way a site is ever re-read. There is no schedule and no
    automatic refresh, by design.
    """
    product = await repo.get_owned(session, product_id, user.id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)

    # A crawl past its own time limit is dead, not busy. Refusing it would
    # strand the row forever, since the server restart that killed it also
    # left it marked "crawling".
    if product.state == CrawlState.CRAWLING and not product_service.is_stale(product):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That crawl is already running. Wait for it to finish.",
        )

    await product_service.reset_for_recrawl(session, product)
    await session.commit()

    background.add_task(product_service.run_crawl, product.id)
    return ProductOut.model_validate(product)
