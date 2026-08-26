"""
Find real posts to reply to, for one product on one platform.

The plan already decided what to search for, so nothing here takes keywords
from the caller. That is the point of the planner: the user presses a button
on a platform card and the agent's own terms are what run.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel

from outreach.api.deps import CurrentUser, DbSession
from outreach.db.repositories import products as repo
from outreach.services import opportunity_service as svc

router = APIRouter(tags=["opportunities"])


class StartIn(BaseModel):
    platform: str = "github"

    #: Override what the plan chose. Empty means "use the plan".
    #:
    #: The planner is a good first guess and a poor last word - it has never
    #: seen the results. Letting the user correct it before spending a run is
    #: cheaper than making them rewrite the whole plan to change one word.
    terms: list[str] | None = None
    repos: list[str] | None = None


class StartOut(BaseModel):
    run_id: str


@router.post(
    "/products/{product_id}/opportunities",
    response_model=StartOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start(
    product_id: uuid.UUID,
    payload: StartIn,
    user: CurrentUser,
    session: DbSession,
    background: BackgroundTasks,
) -> StartOut:
    """
    Start a search. Returns immediately; poll GET for progress and results.

    Takes 30 to 90 seconds: GitHub is slow, and every result is read twice -
    once for meaning, once for intent.
    """
    product = await repo.get_owned(session, product_id, user.id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No product with that id.")

    if payload.platform != "github":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"We cannot search {payload.platform} yet. Only GitHub is connected.",
        )

    run_id = svc.start(
        product_id,
        payload.platform,
        terms=payload.terms,
        repos=payload.repos,
    )
    background.add_task(svc.execute, run_id)
    return StartOut(run_id=run_id)


@router.get("/opportunities/{run_id}")
async def get_run(run_id: str, user: CurrentUser, session: DbSession) -> dict:
    """
    Progress and results.

    Ownership is re-checked on every poll rather than trusted from the start
    call, because a run id in a URL is otherwise a way to read somebody
    else's results.
    """
    try:
        run = svc.get(run_id)
    except svc.OpportunityError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    product = await repo.get_owned(session, uuid.UUID(run["product_id"]), user.id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No run with that id.")

    return run
