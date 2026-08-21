"""Sign up, sign in, sign out."""

from __future__ import annotations

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, HTTPException, Response, status

from outreach import security
from outreach.api.deps import CurrentUser, DbSession
from outreach.config import settings
from outreach.db.models.user import User
from outreach.db.repositories import users as repo
from outreach.schemas.auth import LoginIn, SignUpIn, UserOut

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, user: User) -> None:
    """
    httpOnly, so no script can read it. SameSite=lax, so it survives a normal
    navigation but is not sent on a cross-site POST.
    """
    response.set_cookie(
        key=security.COOKIE_NAME,
        value=security.create_session_token(user.id),
        max_age=settings.session_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def sign_up(payload: SignUpIn, response: Response, session: DbSession) -> User:
    """Create an account and sign in immediately. Nobody wants two forms."""
    email = repo.normalise_email(payload.email)

    if await repo.get_by_email(session, email) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "There is already an account with that email. Try signing in instead.",
        )

    user = await repo.add(
        session,
        User(
            email=email,
            name=payload.name,
            password_hash=security.hash_password(payload.password),
            last_login_at=datetime.now(UTC),
        ),
    )

    _set_session_cookie(response, user)
    log.info("auth.signed_up", user_id=str(user.id))
    return user


@router.post("/login", response_model=UserOut)
async def log_in(payload: LoginIn, response: Response, session: DbSession) -> User:
    """
    Sign in.

    A wrong email and a wrong password give the same message on purpose:
    "no account with that email" is a free account-existence check for
    anyone with a list of addresses.
    """
    wrong = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "That email and password do not match.",
    )

    user = await repo.get_by_email(session, payload.email)
    if user is None:
        # Hash anyway. Returning instantly for unknown emails and slowly for
        # known ones leaks exactly what the shared message is hiding.
        security.hash_password(payload.password)
        raise wrong

    if not security.verify_password(payload.password, user.password_hash):
        raise wrong

    # Argon2's cost parameters can be raised later. Anyone who signs in after
    # that gets upgraded here, without being asked to change their password.
    if security.needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(payload.password)

    user.last_login_at = datetime.now(UTC)

    _set_session_cookie(response, user)
    log.info("auth.signed_in", user_id=str(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def log_out(response: Response) -> None:
    response.delete_cookie(security.COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    """Who is signed in. The frontend calls this once on load."""
    return user
