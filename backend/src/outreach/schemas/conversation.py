"""
Conversation - the one shape every source turns into.

GitHub issues, Hacker News stories and Reddit posts all become this, so
everything downstream reads one thing instead of three. Keep it small: add a
field when something actually needs it, not because a source happens to
return it.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class Conversation(BaseModel):
    source: str
    """"github", "hackernews", ..."""

    source_id: str
    """Stable id within the source. Together with `source`, the identity."""

    url: str
    title: str | None = None
    body: str = ""

    author: str | None = None
    author_is_bot: bool = False
    """Bot chatter is the biggest source of noise in issue trackers, so it is
    marked when fetched rather than guessed at later."""

    created_at: datetime

    score: int = 0
    """Reactions, points, upvotes. Only comparable within one source."""

    comments: int = 0

    container: str | None = None
    """Where it lives: "run-llama/llama_index", a subreddit, etc."""

    author_association: str | None = None
    """
    GitHub only, and one of the strongest signals available.

    OWNER, MEMBER and COLLABORATOR mean the author is writing in their own
    project - a task ticket, a roadmap note, a self-assigned bug. There is
    nobody to sell to. NONE means an outsider turned up with a problem, which
    is precisely the lead we want.
    """

    labels: list[str] = []

    # ---- computed, not from the source ----------------------------------

    relevance: float | None = None
    """
    0-1, how well this matches what we are looking for. Filled in by
    rank.py, min-max scaled across one result set - so it compares results
    within a search and means nothing across two different searches.
    """

    relevance_raw: float | None = None
    """The unscaled cosine similarity, kept for tuning cutoffs."""

    # ---- from the classifier (stage 5) ----------------------------------

    intent: str | None = None
    """SOLUTION_SEEKING, COMPARISON, PROBLEM, BUILDING, SUPPORT,
    ANNOUNCEMENT or IRRELEVANT."""

    pain_point: str | None = None
    evidence_quote: str | None = None
    """Verbatim from the post, verified as a substring before storing. Empty
    when the model could not find real supporting text."""

    asking_for_help: bool = False

    post_domain: str | None = None
    """What kind of system the post is about, in the model's own words -
    "C++ code indexing", "LLM vector retrieval". Shown so a wrong domain
    judgement is visible rather than buried inside a score."""

    same_domain: bool = False
    """
    Is this the same kind of system the product is for?

    Staleness, invalidation and expensive reindexing look identical in code
    indexers, databases, search engines and CI caches. Structural similarity
    is not a market, so this is a hard gate rather than a penalty.
    """

    fit: str | None = None
    """strong, possible, weak or none."""

    product_fit: float | None = None
    """0-1, derived from `fit` and gated by `same_domain`."""

    reason: str | None = None

    # ---- from scoring (stage 6) -----------------------------------------

    opportunity: int | None = None
    """0-100. Relevance and intent are gates, so failing either scores near
    zero regardless of how popular or recent the post is."""

    @property
    def text(self) -> str:
        """Title and body together, for searching."""
        return f"{self.title}\n\n{self.body}".strip() if self.title else self.body
