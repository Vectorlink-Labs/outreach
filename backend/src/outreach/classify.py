"""
Stage 5: an LLM reads each post and says what the author is actually doing.

Embeddings got us the right topic. They cannot tell "I found this bug in our
code, here is the migration to fix it" from "my index is broken, what do people
do?" - those two sentences are semantically almost identical and commercially
opposite. That judgement is what this stage buys.

Only ever runs on the top N after ranking. Classifying everything fetched
would be five times the cost and latency for results nobody will see.

── The cache is the point ────────────────────────────────────────────────
Intent never changes. An issue classified today is classified correctly next
month, so the answer is stored against a hash of the post's own text plus the
prompt and model versions. Searches overlap heavily - same repositories,
similar phrases - so most classifications after the first few runs are free.
That is also why each post gets its own call rather than being batched: a
batch cannot be cached per document.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

import httpx
import structlog
from pydantic import BaseModel

from outreach.config import settings
from outreach.schemas.conversation import Conversation

log = structlog.get_logger(__name__)

CHAT_URL = "https://api.openai.com/v1/chat/completions"
PROMPT_PATH = Path(__file__).parent / "llm" / "prompts" / "classify.v1.md"
#: Part of the cache key. Bump it whenever the prompt changes, so old
#: judgements are discarded instead of silently reused against a new rubric.
PROMPT_VERSION = "classify.v5"

#: Enough of a post to judge intent. Bodies run to thousands of words of
#: stack traces; the first part carries the intent.
MAX_BODY_CHARS = 3000

#: OpenAI tolerates far more, but eight keeps one search inside a few seconds
#: without tripping rate limits.
CONCURRENCY = 8

CACHE_PATH = Path(__file__).resolve().parents[3] / ".cache" / "classify.json"


#: A categorical judgement mapped to a number, rather than asking the model
#: for a float directly. Models reach for round numbers - every result came
#: back 0.86, then every result came back 0.90 - and four named bands with
#: written definitions are something they judge reliably.
FIT_VALUE = {
    "strong": 0.90,
    "possible": 0.55,
    "weak": 0.20,
    "none": 0.0,
}

#: How much a domain mismatch costs.
#:
#: This was a hard gate - anything but an exact domain match scored zero -
#: and it was too blunt. The gate exists for a real reason: staleness,
#: invalidation and expensive rebuilds look identical in code indexers,
#: databases, search engines and CI caches, and structural similarity is not
#: a market. A C++ language server reindexing after a header change must not
#: score as a lead.
#:
#: But "different domain" was doing two jobs at once. A post about KV-cache
#: reuse in a local inference server is not the same domain as a context
#: cache for agents, and it is not a C++ language server either - it is the
#: next room over, full of exactly the right people. Zeroing both equally
#: threw away real leads to catch fake ones.
#:
#: Three levels rather than two, so `adjacent` survives at a penalty and
#: `different` still dies.
#: `adjacent` was 0.35 and that was still too harsh. Measured against a real
#: run: a strong fit in an adjacent domain came out at 0.32, which after the
#: rest of the arithmetic capped the best result on the page at 39 - below the
#: threshold where the UI stops calling it mediocre. The model was doing its
#: job and the number was throwing the answer away.
#:
#: 0.55 is set so that a `strong` fit one room over lands in the high band
#: rather than the middle of it, while `same` still clearly outranks it.
DOMAIN_MULTIPLIER = {
    "same": 1.00,
    "adjacent": 0.55,
    "different": 0.10,
}


class Analysis(BaseModel):
    intent: str = "IRRELEVANT"
    pain_point: str = ""
    evidence_quote: str = ""
    asking_for_help: bool = False
    #: The model names both domains in its own words before comparing them.
    #: Making it commit to a category is what stops "index staleness" reading
    #: as one domain when it spans five - it cannot write "C++ code indexing"
    #: and "LLM vector retrieval" and then call them the same thing.
    post_domain: str = ""
    product_domain: str = ""
    domain_match: str = "different"
    fit: str = "none"
    reason: str = ""

    @property
    def same_domain(self) -> bool:
        """Kept for display and for everything downstream that reads a bool."""
        return self.domain_match.lower().strip() == "same"

    @property
    def product_fit(self) -> float:
        """0-1, for scoring. Fit as judged, scaled by how close the domain is."""
        fit = FIT_VALUE.get(self.fit.lower().strip(), 0.0)
        domain = DOMAIN_MULTIPLIER.get(self.domain_match.lower().strip(), 0.10)
        return fit * domain


class ClassifyError(Exception):
    """Something the user needs to know about, phrased for a person."""


# ---------------------------------------------------------------- the cache


def _load_cache() -> dict[str, dict]:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_cache(cache: dict[str, dict]) -> None:
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")
    except OSError as exc:
        # A cache that cannot be written is a slower system, not a broken one.
        log.warning("classify.cache_write_failed", error=str(exc))


def _cache_key(conversation: Conversation, product: str) -> str:
    """
    Identity of one judgement.

    Everything that could change the answer goes in: the post, the product we
    are judging against, the prompt, and the model. Change any of them and the
    old answer is correctly discarded rather than silently reused.
    """
    material = "\x00".join(
        [
            conversation.text[:MAX_BODY_CHARS],
            product,
            PROMPT_VERSION,
            settings.llm_model,
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


# ---------------------------------------------------------------- the work


async def classify_all(
    product: str,
    conversations: list[Conversation],
) -> tuple[list[Conversation], list[str]]:
    """
    Classify each conversation, in parallel, using the cache where possible.

    Returns the conversations with their analysis attached, plus notes for
    the caller to surface.
    """
    if not conversations:
        return [], []
    if not settings.openai_api_key:
        raise ClassifyError("No OPENAI_API_KEY set in backend/.env.")

    prompt_template = _read_prompt()
    cache = _load_cache()
    semaphore = asyncio.Semaphore(CONCURRENCY)
    hits = 0
    failures = 0

    async with httpx.AsyncClient(timeout=60.0) as client:

        async def one(conversation: Conversation) -> None:
            nonlocal hits, failures
            key = _cache_key(conversation, product)

            if key in cache:
                hits += 1
                _attach(conversation, Analysis(**cache[key]))
                return

            async with semaphore:
                try:
                    analysis = await _ask(client, prompt_template, product, conversation)
                except Exception as exc:
                    failures += 1
                    log.warning("classify.failed", url=conversation.url, error=str(exc))
                    return

            cache[key] = analysis.model_dump()
            _attach(conversation, analysis)

        await asyncio.gather(*(one(c) for c in conversations))

    _save_cache(cache)

    notes = [f"classified {len(conversations)} ({hits} from cache)"]
    if failures:
        notes.append(f"{failures} could not be classified and were left unscored")

    return conversations, notes


async def _ask(
    client: httpx.AsyncClient,
    template: str,
    product: str,
    conversation: Conversation,
) -> Analysis:
    prompt = template.format(
        product=product.strip(),
        container=conversation.container or "unknown",
        title=conversation.title or "(no title)",
        body=conversation.body[:MAX_BODY_CHARS],
    )

    response = await client.post(
        CHAT_URL,
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        json={
            "model": settings.llm_model,
            "messages": [{"role": "user", "content": prompt}],
            # Classification should be repeatable. The same post must not get
            # a different intent on a re-run.
            "temperature": 0,
            "response_format": {"type": "json_object"},
        },
    )
    if response.status_code != 200:
        raise ClassifyError(f"OpenAI returned {response.status_code}: {response.text[:200]}")

    content = response.json()["choices"][0]["message"]["content"]
    analysis = Analysis(**json.loads(content))

    # The quote must exist in the post. An invented quote is worse than no
    # quote: it is the one thing a user will check, and the one thing that
    # destroys trust in every other number if it turns out to be fabricated.
    if analysis.evidence_quote and not _quote_is_real(analysis.evidence_quote, conversation):
        log.info("classify.quote_not_found", url=conversation.url)
        analysis.evidence_quote = ""

    return analysis


def _quote_is_real(quote: str, conversation: Conversation) -> bool:
    """Substring check, ignoring whitespace and case differences only."""
    haystack = " ".join(conversation.text.split()).lower()
    needle = " ".join(quote.split()).lower()
    return needle in haystack


def _attach(conversation: Conversation, analysis: Analysis) -> None:
    conversation.intent = analysis.intent
    conversation.pain_point = analysis.pain_point or None
    conversation.evidence_quote = analysis.evidence_quote or None
    conversation.asking_for_help = analysis.asking_for_help
    conversation.post_domain = analysis.post_domain or None
    conversation.domain_match = analysis.domain_match
    conversation.same_domain = analysis.same_domain
    conversation.fit = analysis.fit
    conversation.product_fit = analysis.product_fit
    conversation.reason = analysis.reason or None


def _read_prompt() -> str:
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise ClassifyError(f"Cannot read {PROMPT_PATH.name}: {exc}") from exc
