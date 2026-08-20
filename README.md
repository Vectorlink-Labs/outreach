# Outreach

Finds public developer conversations where someone has the problem our product solves,
ranks them by how good an opportunity they are, and shows the evidence behind every score.

A marketer fills in a short brief. The system searches connected public sources
(GitHub and Hacker News at launch), ranks the results, and explains each one.

---

## The three objects everything else hangs off

Understanding these three is enough to navigate the whole codebase.

| Object | Nature | Lives in |
|---|---|---|
| **Brief** | What the user filled in. Mutable, human-facing. | `schemas/brief.py` |
| **SearchPlan** | Compiled from a Brief. Frozen, versioned, content-hashed. **The only thing the pipeline ever executes.** | `schemas/plan.py` |
| **SearchRun** | One execution of one plan. A durable database row, not a request. | `schemas/run.py` |

Two rules follow from this, and most bugs come from breaking them:

1. **The compiler contains no LLM and no I/O.** `domain/compiler.py` is a pure function.
   The one LLM call (keyword expansion) happens *before* compilation and its output is
   frozen into the plan as literal terms. That is what makes a run reproducible and its
   cost knowable in advance.
2. **Predicates for what the user declared, scores for what the model inferred.**
   Date window, sources, language, minimum engagement, excluded terms are SQL `WHERE`
   clauses applied before any scoring. Relevance, intent, pain severity are score
   components. Never mix them.

---

## Repository layout

```
backend/     FastAPI service, workers, pipeline, evaluation harness
frontend/    React + MUI (Material UI)
docs/        Architecture notes and decision records — read docs/architecture/overview.md first
infra/       Container and Cloud Run definitions
scripts/     One-off operational scripts
```

### Inside `backend/src/outreach/`

| Package | Responsibility | May do I/O? |
|---|---|---|
| `api/` | HTTP only. Parse, authorize, delegate, serialize. No business logic. | via services |
| `schemas/` | Pydantic contracts. The shared vocabulary between layers. | no |
| `domain/` | Pure logic: compiler, hashing, fusion, scoring, dedupe math. **Fully testable with no database.** | **no** |
| `pipeline/` | The fixed ordered stages and the executor that runs them. | yes |
| `connectors/` | One package per source. Each returns the same `Conversation` shape. | yes |
| `services/` | Orchestration between domain, db, and external systems. | yes |
| `db/` | Models and repositories. All SQL lives here. | yes |
| `llm/` `embeddings/` `rerank/` | Thin provider abstractions. One protocol, several implementations. | yes |
| `search/` | The retrieval SQL. | yes |
| `workers/` | Dramatiq actors, scheduler entry points, the stalled-run reaper. | yes |
| `products/` | Product profiles. Phase 1 loads YAML; the API is the seam for Phase 2. | reads files |
| `eval/` | Golden set, metrics, weight tuning. Not shipped to production. | yes |

`domain/` is the part worth protecting. If it stays free of I/O, the scoring and
compilation logic can be tested exhaustively in milliseconds, and weight changes
become a backfill query instead of a re-crawl.

---

## What we deliberately do not use

| | Why |
|---|---|
| **LangGraph** | The stages run in a fixed order decided by the compiler before the run starts. Nothing branches at runtime, so there is no graph to execute. `pipeline/executor.py` is the replacement. See `docs/adr/0001`. |
| **MCP** | Nothing needs to discover tools. Our code calls GitHub and Hacker News directly. See `docs/adr/0002`. |
| **LangChain** | We need one function that sends text to a model and validates the response. That is `llm/base.py`. |
| **A separate search engine** | Postgres FTS + pgvector handle both retrieval modes at our size. Revisit only when `Recall@300` is measured below target. See `docs/adr/0003`. |

---

## The pipeline

Stages run in the order listed in `plan.pipeline.stages`. The compiler writes that list;
the executor never decides anything on its own.

```
expand → coverage → fetch → normalize → dedupe → embed
       → retrieve → fuse → rerank → analyze → score → diversify
       → synthesize → persist
```

Each stage is `async def stage(ctx: RunContext) -> RunContext`. Adding one means writing
a function and registering it in `pipeline/registry.py`.

**The funnel narrows on purpose.** Each stage costs more per item than the one before, so
each one's job is to protect the next:

| Stage | In → Out | Cost |
|---|---|---|
| fetch | → ~2,000 | free |
| dedupe | 2,000 → 1,200 | free |
| fuse | 1,200 → 300 | free |
| rerank | 300 → 60 | ~$0.006 |
| analyze | 60 → 25 | ~$0.20 |
| persist | 25 → 20 shown | free |

Reranking before analysis rather than after is roughly an 11× cost difference for the
same output. Do not reorder these two.

---

## Getting started

**PostgreSQL runs natively — there is no Docker in local dev.** Full setup, including
installing Postgres on Windows and creating the role, is in
[backend/README.md](backend/README.md).

Point `DATABASE_URL` at the `postgres` superuser your installer created, and there
is no database setup at all — the database, its tables and every migration are
applied on first startup. See [backend/README.md](backend/README.md) for the
dedicated-role alternative.

```bash
cd backend
py -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
copy .env.example .env
.venv\Scripts\python.exe -m uvicorn outreach.main:app --reload
```

```bash
cd frontend
npm install
npm run dev          # runs on mock data by default — see frontend/src/lib/client.ts
```

`pgvector` is **not** installed yet. Nothing uses it until the retrieval work starts.

---

## Before changing anything that affects ranking

Run the evaluation harness. Prompt edits, weight changes, a new embedding model, and a
different reranker all move result quality, and none of them are visible without it.

```bash
cd backend
python -m eval.run_eval          # metrics against the golden set
python -m eval.tune_weights      # coordinate ascent over weights
```

Release gates live in `eval/report.py`. A change ships only if `nDCG@20` does not drop
more than 0.02 and no run has an irrelevant document in its top 5.

---

## Source policy

- **GitHub** and **Hacker News** use official public APIs. Both have real rate limits;
  `connectors/ratelimit.py` enforces them and no run may exceed its per-run call budget.
- **Reddit is disabled.** Commercial use of their data requires an agreement. The
  connector exists as a seam so nothing else has to change when that lands.
- **The system never posts anything.** `reply_service.py` drafts; a person edits and
  posts under their own name. This is permanent, not a phase-one limitation.

See `docs/legal/source-policy.md` for what may be stored and displayed per source.
