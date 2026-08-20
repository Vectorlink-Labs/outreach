"""
GitHub connector. Searches issues, returns Conversations.

One file, three steps, read top to bottom:

    build_query()   phrase + filters  ->  a GitHub search string
    to_conversation()   one API item  ->  one Conversation
    search()        run the queries, page through, handle rate limits

Two GitHub limits shape all of it and neither is optional:

  * a search query longer than 256 characters is rejected outright
  * search allows 30 requests a minute, and going over gets you a 403 with a
    Retry-After header rather than a friendly warning
"""

from __future__ import annotations

import asyncio
import re
import time
from datetime import UTC, datetime, timedelta

import httpx
import structlog
from pydantic import BaseModel

from outreach.config import settings
from outreach.schemas.conversation import Conversation

log = structlog.get_logger(__name__)

SEARCH_URL = "https://api.github.com/search/issues"

MAX_QUERY_CHARS = 256
#: GitHub will not serve past this, whatever total_count claims.
HARD_RESULT_CAP = 1000
PER_PAGE = 100

_BOT = re.compile(r"(\[bot\]$|^dependabot|^renovate|^github-actions|-bot$)", re.I)
_REPO_FROM_API_URL = re.compile(r"/repos/([^/]+/[^/]+)")


class SearchResult(BaseModel):
    conversations: list[Conversation] = []
    requests_made: int = 0
    notes: list[str] = []
    """What each query returned and anything that was skipped. Read this
    first when the result count is surprising."""


# ---------------------------------------------------------------- 1. queries


def build_query(
    phrase: str = "",
    repo: str | None = None,
    days: int = 30,
    exclude: list[str] | None = None,
) -> str:
    """
    Build one search string, trimmed to fit GitHub's 256 character limit.

    Filters are dropped from the end if it would overflow. Dropping one
    widens the search, which is recoverable; going over the limit returns a
    422 and loses the query completely, which is not. The phrase is never
    dropped, because a search without its phrase is a different search.
    """
    since = (datetime.now(UTC) - timedelta(days=days)).date().isoformat()

    parts: list[str] = []
    if phrase:
        clean = " ".join(phrase.split()).strip('"')
        # Unquoted "stale embeddings" means "stale AND embeddings anywhere",
        # which matches far more and far worse than the phrase does.
        parts.append(f'"{clean}"' if " " in clean else clean)

    # /search/issues returns pull requests too, and someone's own patch is
    # almost never a marketing opportunity.
    parts.append("is:issue")
    parts.append(f"created:>={since}")

    if repo:
        parts.append(f"repo:{repo}")

    # Exclusions last: first to be sacrificed to the length limit, and GitHub
    # only allows five boolean operators anyway.
    for term in (exclude or [])[:3]:
        parts.append(f'-"{term}"' if " " in term else f"-{term}")

    query = " ".join(parts)
    while len(query) > MAX_QUERY_CHARS and len(parts) > 1:
        parts.pop()
        query = " ".join(parts)
    return query


def build_queries(
    phrases: list[str],
    repos: list[str] | None = None,
    days: int = 30,
    exclude: list[str] | None = None,
) -> list[tuple[str, str]]:
    """
    One query per phrase, plus one per repository. Returns (label, query).

    Separate queries rather than one big boolean, because GitHub search has
    no grouping and a five-operator cap - "any of these fifteen phrases"
    cannot be expressed, so we just ask fifteen times.

    Repository queries carry no phrase at all. That is deliberate: every
    recent issue in a repo where our buyers already are becomes a candidate,
    which is how we find someone who described the problem in words we never
    thought of. A keyword-only search can never recover that.
    """
    out: list[tuple[str, str]] = []
    seen: set[str] = set()

    for phrase in phrases:
        clean = " ".join(phrase.split())
        if not clean:
            continue
        query = build_query(clean, days=days, exclude=exclude)
        if query not in seen:
            seen.add(query)
            out.append((f"phrase: {clean}", query))

    for repo in repos or []:
        query = build_query(repo=repo, days=days)
        if query not in seen:
            seen.add(query)
            out.append((f"repo: {repo}", query))

    return out


# ---------------------------------------------------------------- 2. mapping


def to_conversation(item: dict) -> Conversation | None:
    """
    One search result to a Conversation. None when it cannot be used.

    Returns None instead of raising so that one malformed item does not lose
    the other ninety-nine in the page.
    """
    try:
        source_id = str(item.get("node_id") or item.get("id") or "")
        url = item.get("html_url")
        created = item.get("created_at")
        if not source_id or not url or not created:
            return None

        user = item.get("user") or {}
        handle = user.get("login")
        reactions = item.get("reactions") or {}

        return Conversation(
            source="github",
            source_id=source_id,
            url=url,
            title=item.get("title"),
            body=item.get("body") or "",
            author=handle,
            author_is_bot=(
                user.get("type") == "Bot" or bool(handle and _BOT.search(handle))
            ),
            created_at=datetime.fromisoformat(created.replace("Z", "+00:00")),
            score=_reactions(reactions),
            comments=int(item.get("comments") or 0),
            container=_repo(item),
            author_association=item.get("author_association"),
            labels=[
                label["name"]
                for label in item.get("labels") or []
                if isinstance(label, dict) and label.get("name")
            ],
        )
    except (TypeError, ValueError, KeyError):
        return None


def _reactions(reactions: dict) -> int:
    """Total reactions, ignoring the `url` key GitHub puts in the object."""
    total = reactions.get("total_count")
    if isinstance(total, int):
        return total
    return sum(v for k, v in reactions.items() if k != "url" and isinstance(v, int))


def _repo(item: dict) -> str | None:
    """"owner/name", from whichever field this response happens to carry."""
    api_url = item.get("repository_url") or ""
    match = _REPO_FROM_API_URL.search(str(api_url))
    if match:
        return match.group(1)
    parts = [p for p in str(item.get("html_url") or "").split("/") if p]
    return f"{parts[2]}/{parts[3]}" if len(parts) >= 4 else None


# ---------------------------------------------------------------- 3. fetching


#: The only association that means a genuine outsider.
#:
#: An allowlist rather than a blocklist, because GitHub keeps adding values
#: (FIRST_TIME_CONTRIBUTOR, MANNEQUIN, ...) and a blocklist silently lets each
#: new one through. CONTRIBUTOR is excluded deliberately: it means the author
#: has had a pull request merged into that repository, so they are working on
#: the project, not evaluating tools for it. That single change removed both
#: of the false positives this filter was written for.
OUTSIDER = frozenset({"NONE"})


async def search(
    phrases: list[str],
    repos: list[str] | None = None,
    days: int = 30,
    exclude: list[str] | None = None,
    max_requests: int = 10,
    drop_bots: bool = True,
    outsiders_only: bool = False,
) -> SearchResult:
    """
    Run every query and collect the results.

    A failing query is noted and skipped rather than raised, so one bad
    phrase does not cost the other nineteen.
    """
    queries = build_queries(phrases, repos, days, exclude)
    result = SearchResult()
    seen: set[str] = set()

    if not settings.github_token:
        result.notes.append(
            "No GITHUB_TOKEN set: 10 requests a minute instead of 30."
        )

    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        for label, query in queries:
            if result.requests_made >= max_requests:
                result.notes.append(f"Stopped at the {max_requests} request limit.")
                break
            try:
                found = await _run_one(client, query, result, seen, max_requests)
                result.notes.append(f"{label} -> {found}")
                if found == 0 and label.startswith("phrase: "):
                    hint = _why_nothing(label.removeprefix("phrase: "))
                    if hint:
                        result.notes.append(f"    {hint}")
            except Exception as exc:
                log.warning("github.query_failed", label=label, error=str(exc))
                result.notes.append(f"{label} failed: {exc}")

    _apply_filters(result, drop_bots=drop_bots, outsiders_only=outsiders_only)
    return result


def _why_nothing(phrase: str) -> str | None:
    """
    Explain an empty phrase query, because the reason is never obvious.

    A multi-word phrase is searched as an exact quoted string. That works for
    terms of art - "stale embeddings" is a fixed compound people reuse
    verbatim - and fails completely for anything sentence-shaped, because
    nobody writes the same sentence twice.

    The instinct to search for how a frustrated person *talks* is right. It
    just belongs in the `product` text, where the embedding matches meaning,
    not here, where GitHub matches characters.
    """
    words = phrase.split()
    if len(words) >= 4:
        return (
            f"searched as the exact string \"{phrase}\" - too sentence-like to "
            f"match anything. Try a 2-3 word fragment such as "
            f"\"{' '.join(words[-2:])}\", and put the full description in "
            f"`product` instead."
        )
    return "no matches. Try a broader term, or add a repo to sweep."


def _apply_filters(
    result: SearchResult, *, drop_bots: bool, outsiders_only: bool
) -> None:
    """
    Drop the obvious non-leads, and say how many went and why.

    Filtering after fetching rather than in the query, because GitHub search
    cannot express either of these. Reporting the counts matters as much as
    the filtering: "found 12" is alarming on its own, and unremarkable next
    to "dropped 180 written by repo owners".
    """
    kept: list[Conversation] = []
    dropped_bots = 0
    dropped_insiders = 0

    for conversation in result.conversations:
        if drop_bots and conversation.author_is_bot:
            dropped_bots += 1
            continue
        if outsiders_only and conversation.author_association not in OUTSIDER:
            dropped_insiders += 1
            continue
        kept.append(conversation)

    if dropped_bots:
        result.notes.append(f"dropped {dropped_bots} bot-authored")
    if dropped_insiders:
        result.notes.append(
            f"dropped {dropped_insiders} written by people who work on that repo "
            f"(owner, member, collaborator or past contributor)"
        )

    result.conversations = kept


async def _run_one(
    client: httpx.AsyncClient,
    query: str,
    result: SearchResult,
    seen: set[str],
    max_requests: int,
) -> int:
    """Page through one query. Returns how many new conversations it added."""
    added = 0
    page = 1

    while result.requests_made < max_requests and page * PER_PAGE <= HARD_RESULT_CAP:
        # No `sort` parameter, which means GitHub's own best-match ordering.
        #
        # Sorting by `created` looks sensible and is actively harmful here: a
        # query matching 89,000 issues only ever serves 1,000, so sorting by
        # date means the 1,000 *newest* rather than the 1,000 *best*. The
        # date window is already pinned by `created:>=` in the query, so
        # relevance ordering costs no recency and gains a far better sample.
        payload = await _get(
            client,
            {"q": query, "per_page": PER_PAGE, "page": page},
        )
        result.requests_made += 1

        items = payload.get("items") or []
        if not items:
            break

        total = int(payload.get("total_count") or 0)
        if page == 1 and total > HARD_RESULT_CAP:
            # Say so rather than letting a run silently see a tenth of what
            # exists. The fix is a narrower date window, not more pages.
            result.notes.append(
                f"  matched {total:,} but GitHub serves at most {HARD_RESULT_CAP}"
            )

        for item in items:
            if "pull_request" in item:
                continue
            conversation = to_conversation(item)
            if conversation is None:
                continue
            key = f"{conversation.source}:{conversation.source_id}"
            if key in seen:
                continue
            seen.add(key)
            result.conversations.append(conversation)
            added += 1

        if len(items) < PER_PAGE:
            break
        page += 1

    return added


async def _get(client: httpx.AsyncClient, params: dict) -> dict:
    """
    One request, waiting as long as GitHub asks when it says to wait.

    Rate limiting arrives as 403 or 429 with a Retry-After header. When a
    server tells you exactly how long to wait, guessing is worse.
    """
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    for _ in range(3):
        response = await client.get(SEARCH_URL, params=params, headers=headers)

        if response.status_code == 200:
            return response.json()

        if response.status_code in (403, 429):
            wait = _retry_after(response)
            if wait is None:
                raise RuntimeError(
                    "GitHub returned 403 with no rate-limit headers. "
                    "The token is probably invalid."
                )
            log.warning("github.rate_limited", wait_seconds=wait)
            await asyncio.sleep(min(wait, 60))
            continue

        if response.status_code == 422:
            raise RuntimeError(f"GitHub rejected the query: {response.text[:200]}")

        response.raise_for_status()

    raise RuntimeError("Still rate limited after three attempts.")


def _retry_after(response: httpx.Response) -> float | None:
    """How long GitHub wants us to wait, or None if this is not a rate limit."""
    header = response.headers.get("retry-after")
    if header:
        try:
            return float(header)
        except ValueError:
            pass

    if response.headers.get("x-ratelimit-remaining") == "0":
        reset = response.headers.get("x-ratelimit-reset")
        if reset:
            try:
                return max(float(reset) - time.time(), 1.0)
            except ValueError:
                pass

    # Secondary limits sometimes arrive with neither header.
    if "secondary rate limit" in response.text.lower():
        return 60.0

    return None
