"""
The planner agent: product profile + goal -> a marketing plan.

This is the step that turns a search tool into a marketing platform. Before
it, the user had to know which words to search for. After it, the agent reads
what the product is and what the owner wants, and writes the plan - including
the search terms our crawler then executes.

Two things it must not do, both of which an unguided model does by default:

  * Give advice that would fit any product. "Post on Reddit, engage with the
    community, build in public" is free and worth nothing.
  * Pretend we can search a platform we cannot. The plan is split into what
    we can act on and what is only advice, and the user is told which is
    which rather than clicking a LinkedIn card and finding nothing.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import httpx
import structlog
from pydantic import BaseModel, Field

from outreach.config import settings
from outreach.connectors import github as gh_syntax

log = structlog.get_logger(__name__)

CHAT_URL = "https://api.openai.com/v1/chat/completions"
PROMPT_PATH = Path(__file__).parent / "llm" / "prompts" / "planner.v1.md"
#: Bump on every prompt change: it is part of `source_hash`, so this is what
#: makes existing plans regenerate instead of sticking to the old rubric.
PROMPT_VERSION = "planner.v4"

#: Platforms we can actually search. Everything else is advice only.
#: The model is not asked to decide this - we know it, and letting it guess
#: is how a user ends up clicking "find posts" on LinkedIn.
SEARCHABLE = {"github", "hackernews"}

#: Not yet built, but the plan may still recommend it. Shown as "coming soon"
#: rather than as something you can run today.
COMING_SOON = {"hackernews"}


class Platform(BaseModel):
    key: str
    name: str
    why: str = ""
    what_to_do: str = ""
    tone: str = ""
    search_terms: list[str] = Field(default_factory=list)
    target_places: list[str] = Field(default_factory=list)

    # Set by us, never by the model.
    searchable: bool = False
    available_now: bool = False


class MarketingPlan(BaseModel):
    strategy: str = ""
    audience: str = ""
    positioning: str = ""
    platforms: list[Platform] = Field(default_factory=list)
    content_ideas: list[str] = Field(default_factory=list)
    first_week: list[str] = Field(default_factory=list)

    @property
    def actionable(self) -> list[Platform]:
        """Searchable today. The centre of the dashboard."""
        return [p for p in self.platforms if p.available_now]

    @property
    def coming_soon(self) -> list[Platform]:
        """We will be able to search these; the connector is not built yet."""
        return [p for p in self.platforms if p.searchable and not p.available_now]

    @property
    def advice_only(self) -> list[Platform]:
        """
        We can never search these - Twitter, LinkedIn, Discord.

        Kept separate from `coming_soon` on purpose. "Not yet" and "not ever"
        set completely different expectations, and collapsing them means a
        user waits for posts that are never going to appear.
        """
        return [p for p in self.platforms if not p.searchable]


def source_hash(profile: dict | None, description: str, goal: str) -> str:
    """
    What the plan was built from.

    Changing the goal should produce a new plan; re-crawling a site that did
    not change should not. Both fall out of hashing the three inputs.

    `PROMPT_VERSION` is in here as well, and has to be. Without it a change
    to the prompt only reaches products created afterwards: every existing
    plan keeps its stored hash, looks fresh forever, and quietly goes on
    using terms written against a rubric that no longer exists. Bumping the
    version is then the one action that makes a prompt change take effect.
    """
    material = json.dumps(
        {
            "profile": profile or {},
            "description": description or "",
            "goal": goal or "",
            "prompt": PROMPT_VERSION,
        },
        sort_keys=True,
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


async def make_plan(
    *,
    name: str,
    url: str,
    description: str,
    goal: str,
    profile: dict | None,
) -> MarketingPlan | None:
    """
    Write the plan. None if it cannot be done.

    Never raises. A product without a plan still works - the user can search
    manually, as they did before this existed.
    """
    if not settings.openai_api_key:
        return None

    profile_text = _profile_text(profile)
    if not (description or goal or profile_text):
        return None

    try:
        prompt = PROMPT_PATH.read_text(encoding="utf-8").format(
            name=name or "(unnamed)",
            url=url or "(none)",
            description=description or "(not given)",
            goal=goal or "(not given)",
            profile=profile_text or "(the website could not be read)",
        )
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                CHAT_URL,
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={
                    "model": settings.planner_model,
                    "messages": [{"role": "user", "content": prompt}],
                    # A little warmth: a plan is writing, not classification,
                    # and at zero it produces the same four bland platforms
                    # for every product.
                    "temperature": 0.5,
                    "response_format": {"type": "json_object"},
                },
            )
            if response.status_code != 200:
                log.warning("planner.failed", status=response.status_code,
                            body=response.text[:200])
                return None

            payload = json.loads(response.json()["choices"][0]["message"]["content"])
            plan = MarketingPlan(**payload)
    except Exception as exc:
        log.warning("planner.failed", error=str(exc))
        return None

    _mark_platforms(plan)

    log.info(
        "planner.made",
        platforms=len(plan.platforms),
        actionable=len(plan.actionable),
    )
    return plan


#: Most terms a single platform may keep.
MAX_TERMS = 12


def _usable_terms(terms: list[str]) -> list[str]:
    """
    Drop the search terms that cannot work, keep the rest in the model's order.

    Two shapes are allowed, and they fail in opposite directions:

        prompt caching        an exact phrase, 1-3 words
        prompt caching + RAG  an intersection, 1-3 words a side

    A plain phrase longer than three words is sentence-shaped, and a sentence
    is searched as an exact string that nobody has ever typed twice. It
    matches nothing at all.

    An intersection is the narrowing tool, so its sides are allowed to be
    single words: `cache + retrieval` is precise because both must appear,
    where `cache` alone matches tens of thousands and is a lottery. More than
    two sides is not narrower in any useful way, just empty.

    ── Terms are NOT capped per concept, and that was tried ──────────────

    A previous version dropped terms once four of them shared a concept, to
    stop a plan spending every slot on the product's catchiest phrase. It
    was wrong, and expensively so: it cut a run from 140 classified posts to
    10 overnight.

    The reasoning was backwards. A cap cannot create coverage that does not
    exist - if a product genuinely is about one thing, capping does not
    produce terms for the other things, it just deletes two thirds of the
    good ones. And it starved twice over, because repository discovery
    counts hits from these same terms, so fewer terms meant fewer terms
    *and* fewer repositories.

    Terms clustering on one concept is not a bug to correct here. It is the
    planner reporting what the product is about, and when that concept is
    where the market turns out to be, every one of those terms earns its
    place. Breadth belongs in the product description, which is a decision
    for a person, not in a filter that silently throws work away.
    """
    kept: list[str] = []
    seen: set[str] = set()

    for term in terms:
        if not term or not term.strip():
            continue

        sides = [" ".join(s.split()) for s in term.split(gh_syntax.INTERSECT)]
        sides = [s for s in sides if s]
        if not sides or len(sides) > 2:
            continue
        if any(len(s.split()) > 3 for s in sides):
            continue
        # A single side must still carry enough to be a phrase rather than a
        # dragnet; two sides earn the right to be short by intersecting.
        if len(sides) == 1 and len(sides[0].split()) < 2:
            continue

        clean = f" {gh_syntax.INTERSECT} ".join(sides)
        if clean.lower() in seen:
            continue

        seen.add(clean.lower())
        kept.append(clean)

        if len(kept) >= MAX_TERMS:
            break

    return kept


def _mark_platforms(plan: MarketingPlan) -> None:
    """
    Decide what is actionable. Ours to say, not the model's.

    Also clears search terms on platforms we cannot search: a LinkedIn card
    showing search terms invites the user to expect posts that will never
    arrive.
    """
    for platform in plan.platforms:
        key = platform.key.strip().lower().replace(" ", "")
        platform.key = key
        platform.searchable = key in SEARCHABLE
        platform.available_now = platform.searchable and key not in COMING_SOON

        if not platform.searchable:
            platform.search_terms = []
            platform.target_places = []
            continue

        platform.search_terms = _usable_terms(platform.search_terms)

        platform.target_places = [p.strip() for p in platform.target_places if p.strip()][:15]

    # Best first, actionable ahead of advice, so the top of the dashboard is
    # always something the user can press a button on.
    plan.platforms.sort(key=lambda p: (not p.available_now, not p.searchable))


#: Below this, nobody is asking for help there, however famous it is.
MIN_OPEN_ISSUES = 20

MAX_REPOS = 12

#: How close a repository's description has to be to the product, by meaning.
#: Tuned against a real case: LangChain and Dify sit above it, TiDB and
#: OceanBase - SQL databases that grew vector columns - sit below.
MIN_SIMILARITY = 0.30


async def ground_repos(
    plan: MarketingPlan,
    queries: list[str],
    product_text: str = "",
) -> list[str]:
    """
    Replace remembered repository names with ones GitHub actually has.

    The model names these from training data, which fails three ways at once,
    and one plan managed all three: `microsoft/DeepSpeed` had moved
    organisation, `haystack-ai/haystack` never existed, and
    `facebookresearch/detectron2` is real, popular, and about object
    detection. Recall is the wrong tool for a question with a live answer.

    So: check what it suggested, follow renames, drop the dead ones, then find
    the repositories where this problem is actually discussed and add what is
    missing. Returns notes describing what changed, because silently
    rewriting the agent's plan would be worse than the bad names.
    """
    github_platform = next(
        (p for p in plan.platforms if p.key == "github"), None
    )
    if github_platform is None:
        return []

    from outreach.connectors import github as gh

    notes: list[str] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        if github_platform.target_places:
            good, problems = await gh.check_repos(client, github_platform.target_places)
            github_platform.target_places = good
            notes.extend(problems)

    have = {r.lower() for r in github_platform.target_places}

    # Evidence first: search for the problem and see whose repository the
    # posts came from. A repository that produced five posts about this in
    # six months has proved it belongs here, and nothing had to be inferred
    # from a description.
    try:
        by_hits = await gh.repos_by_hits(
            github_platform.search_terms, days=180, limit=MAX_REPOS
        )
    except Exception as exc:
        log.warning("planner.hit_discovery_failed", error=str(exc))
        by_hits = []

    for repo, hits in by_hits:
        if len(github_platform.target_places) >= MAX_REPOS:
            break
        if repo.lower() in have:
            continue
        have.add(repo.lower())
        github_platform.target_places.append(repo)
        notes.append(f"added {repo} ({hits} posts about this problem)")

    if len(github_platform.target_places) >= MAX_REPOS:
        return notes

    # Only then fall back to asking GitHub which repositories *describe*
    # themselves this way, to fill any space left. Weaker evidence - a
    # description says what a project is, not that anybody there has this
    # problem - so it goes second and takes what is left.
    async with httpx.AsyncClient(timeout=30.0) as client:
        found: dict[str, dict] = {}
        for query in [q for q in queries if q.strip()][:4]:
            try:
                for repo_info in await gh.find_repos(
                    client, query, min_stars=500, limit=10
                ):
                    found.setdefault(repo_info["full_name"], repo_info)
            except Exception as exc:
                log.warning("planner.repo_discovery_failed", query=query, error=str(exc))

    # Nobody asking for help means nothing to find, whatever the star count.
    candidates = [
        r
        for r in found.values()
        if r["full_name"].lower() not in have and r["open_issues"] >= MIN_OPEN_ISSUES
    ]
    if not candidates:
        return notes

    # Judge relevance by what the repository is *about*, not how big it is.
    #
    # Size is a tempting filter and a wrong one: it drops LangChain and Dify,
    # which are exactly where these users are, while keeping TiDB and
    # OceanBase, which are SQL databases that grew a vector column. Comparing
    # the description to the product separates them properly.
    scored = await _by_relevance(candidates, product_text)

    for repo, similarity in scored:
        if len(github_platform.target_places) >= MAX_REPOS:
            break
        if similarity < MIN_SIMILARITY:
            notes.append(
                f"skipped {repo['full_name']} - about something else "
                f"({similarity:.2f})"
            )
            continue

        github_platform.target_places.append(repo["full_name"])
        notes.append(
            f"added {repo['full_name']} ({repo['open_issues']:,} open issues, "
            f"match {similarity:.2f})"
        )

    return notes


async def _by_relevance(
    candidates: list[dict], product_text: str
) -> list[tuple[dict, float]]:
    """
    Sort repositories by how close their description is to the product.

    Falls back to open-issue count when there is nothing to compare against
    or the embedding fails. A worse ordering is survivable; refusing to
    suggest anything is not.
    """
    if not product_text.strip():
        return [(r, 1.0) for r in sorted(candidates, key=lambda r: -r["open_issues"])]

    from outreach import rank

    texts = [product_text] + [
        f"{r['full_name']}. {r['description']}" for r in candidates
    ]
    try:
        vectors = await rank.embed(texts)
    except Exception as exc:
        log.warning("planner.repo_ranking_failed", error=str(exc))
        return [(r, 1.0) for r in sorted(candidates, key=lambda r: -r["open_issues"])]

    product_vector, repo_vectors = vectors[0], vectors[1:]
    scored = [
        (repo, rank.cosine(product_vector, vector))
        for repo, vector in zip(candidates, repo_vectors, strict=True)
    ]
    return sorted(scored, key=lambda pair: -pair[1])


def _profile_text(profile: dict | None) -> str:
    """The extracted profile, flattened for the prompt."""
    if not profile:
        return ""

    lines: list[str] = []
    if profile.get("domain"):
        lines.append(f"Domain: {profile['domain']}")
    if profile.get("summary"):
        lines.append(f"Summary: {profile['summary']}")
    if profile.get("problems"):
        lines.append("Problems it solves: " + "; ".join(profile["problems"]))
    if profile.get("pain_words"):
        lines.append("How users describe the problem: " + ", ".join(profile["pain_words"]))
    if profile.get("competitors"):
        lines.append("Competitors: " + ", ".join(profile["competitors"]))
    if profile.get("buyer"):
        lines.append(f"Buyer: {profile['buyer']}")
    return "\n".join(lines)
