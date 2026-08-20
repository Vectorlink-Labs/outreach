"""
Stage 6: one number, 0-100, for how good an opportunity a post is.

── Why this multiplies instead of adding ─────────────────────────────────

The original plan had weights that summed: 30% relevance, 25% intent, and so
on. That arithmetic lets a post score 60 while being completely irrelevant,
because popularity and freshness can carry it there on their own. Users judge
the whole tool by the worst thing on the first page, so one such result costs
more than ten good ones earn.

Here match and intent are **gates**. Both are 0-1 and both multiply, so a
post that fails either one scores near zero no matter how popular or recent
it is. Freshness and engagement only modulate what survives, within a narrow
band, because they are tie-breakers rather than reasons.

Worked from the results this was built against:

  plur-ai/plur  relevance 1.00, intent BUILDING
    additive:        would score around 60  ← top of page one
    multiplicative:  scores 8               ← correctly buried
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from outreach.schemas.conversation import Conversation

#: How much each intent is worth as a lead. These are the most opinionated
#: numbers in the system and the first thing to tune once real leads have
#: been marked good or bad by a person.
INTENT_WEIGHT = {
    "SOLUTION_SEEKING": 1.00,
    "COMPARISON": 0.90,
    "PROBLEM": 0.55,
    "SUPPORT": 0.15,
    "BUILDING": 0.10,
    "ANNOUNCEMENT": 0.05,
    "IRRELEVANT": 0.00,
}

#: Raw cosine from text-embedding-3-small runs roughly 0.25 for unrelated
#: text and 0.55 for a strong match. Mapping that band to 0-1 gives an
#: absolute score, unlike the min-max scaling used for display, which always
#: makes the best result in a set look perfect.
COSINE_FLOOR = 0.25
COSINE_CEILING = 0.55

#: Days for a post's freshness contribution to halve.
FRESHNESS_HALF_LIFE = 30.0

#: Engagement above this adds nothing more.
ENGAGEMENT_SATURATION = 50.0


def opportunity_score(conversation: Conversation, now: datetime | None = None) -> int:
    """0-100. Multiplicative, so a failed gate cannot be bought back."""
    now = now or datetime.now(UTC)

    match = _match(conversation)
    intent = INTENT_WEIGHT.get(conversation.intent or "IRRELEVANT", 0.0)

    # 0.70 to 1.00. Deliberately narrow: recency and popularity break ties,
    # they do not make an irrelevant post into a lead.
    modifier = (
        0.70
        + 0.20 * _freshness(conversation, now)
        + 0.10 * _engagement(conversation)
    )

    return round(100 * match * intent * modifier)


def band(score: int) -> str:
    if score >= 70:
        return "very-high"
    if score >= 45:
        return "high"
    if score >= 25:
        return "medium"
    return "weak"


def breakdown(conversation: Conversation, now: datetime | None = None) -> dict:
    """
    Why this scored what it did, component by component.

    A marketer is about to post a public comment under their own name. They
    will not act on a number they cannot question, so every score has to be
    openable. The components must also add up to the score shown - a
    breakdown that does not reconcile is worse than none.
    """
    now = now or datetime.now(UTC)

    intent = INTENT_WEIGHT.get(conversation.intent or "IRRELEVANT", 0.0)
    freshness = _freshness(conversation, now)
    engagement = _engagement(conversation)
    match = _match(conversation)

    # The gate is match x intent. Everything else only modulates it, which is
    # why they are shown as a separate band rather than as equal components.
    gate = match * intent
    modifier = 0.70 + 0.20 * freshness + 0.10 * engagement

    return {
        "components": [
            {
                "name": "Intent",
                "raw": round(intent, 3),
                "weight": 1.0,
                "points": round(100 * match * intent * modifier),
                "note": conversation.intent or "unknown",
            },
            {
                "name": "Freshness",
                "raw": round(freshness, 3),
                "weight": 0.20,
                "points": round(100 * gate * 0.20 * freshness),
                "note": f"{(now - conversation.created_at).days} days old",
            },
            {
                "name": "Engagement",
                "raw": round(engagement, 3),
                "weight": 0.10,
                "points": round(100 * gate * 0.10 * engagement),
                "note": f"{conversation.comments} comments, {conversation.score} reactions",
            },
        ],
        "relevance": round(match, 3),
        "subtotal": round(100 * intent * modifier),
        "final": conversation.opportunity or 0,
        "explain": (
            f"Product fit {match:.0%} multiplied by intent {intent:.0%}. "
            f"Recency and engagement adjust the result by {modifier:.0%}."
        ),
    }


def apply(conversations: list[Conversation]) -> list[Conversation]:
    """Score everything and sort by it, best first."""
    now = datetime.now(UTC)
    for conversation in conversations:
        conversation.opportunity = opportunity_score(conversation, now)
    return sorted(conversations, key=lambda c: c.opportunity or 0, reverse=True)


# ---------------------------------------------------------------- components


def _match(conversation: Conversation) -> float:
    """
    How well this fits the product, 0-1.

    Two independent opinions, deliberately combined. The embedding knows the
    topic; the model knows whether *this person* could use the product. They
    disagree most on exactly the posts that matter - right topic, wrong
    author - and the model is the better judge there, so it carries more.
    """
    cosine = conversation.relevance_raw
    embedding_view = (
        _clamp((cosine - COSINE_FLOOR) / (COSINE_CEILING - COSINE_FLOOR))
        if cosine is not None
        else 0.5
    )

    model_view = conversation.product_fit
    if model_view is None:
        # Not classified: fall back to the embedding alone rather than
        # assuming the worst, but do not let it score as if it had passed.
        return embedding_view * 0.6

    return 0.35 * embedding_view + 0.65 * model_view


def _freshness(conversation: Conversation, now: datetime) -> float:
    """
    Exponential decay, not a linear age penalty.

    A thread's chance of still being live falls off fast at first and then
    flattens. Linear decay gets both ends wrong: it treats a two-day-old post
    as barely better than a ten-day-old one, and a ninety-day-old post as
    worthless when it is merely cold.
    """
    age_days = max((now - conversation.created_at).total_seconds() / 86400.0, 0.0)
    return 0.5 ** (age_days / FRESHNESS_HALF_LIFE)


def _engagement(conversation: Conversation) -> float:
    """
    Log-scaled, because the difference between 0 and 5 comments matters and
    the difference between 80 and 200 does not.
    """
    raw = conversation.comments * 2 + conversation.score
    return _clamp(math.log1p(raw) / math.log1p(ENGAGEMENT_SATURATION))


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))
