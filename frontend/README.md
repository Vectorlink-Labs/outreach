# Frontend

React + Material UI. Runs today on an in-browser fake backend, so every screen
is reviewable before FastAPI answers.

```bash
cd frontend
npm install
npm run dev
```

A **Sample data** chip sits in the top bar whenever the fake backend is in use.

## Screens, and the three objects

The routes follow the repository's three objects. A **Brief** compiles to a
frozen **SearchPlan**, a plan produces **SearchRuns**, a run has results.

| Route | File | What it is |
|---|---|---|
| `/` | `routes/new-search.tsx` | The brief form. Creates a Brief, then compiles a Plan. Does not run anything. |
| `/plans/:planId` | `routes/review-plan.tsx` | The compiled plan: terms with origin and reason, predicates, cost estimate, plan hash, example posts. Approving starts a run. |
| `/runs/:runId` | `routes/run.tsx` | The fourteen stages, with results appearing underneath as they land. Redirects to results when it succeeds. |
| `/runs/:runId/results` | `routes/results.tsx` | The permanent result set. Export, weak matches collapsed. |
| `/briefs` | `routes/briefs.tsx` | Saved briefs, each re-runnable. |
| `/settings/product` | `routes/settings-product.tsx` | Placeholder. Profiles are backend YAML in phase 1. |

Editing terms on the review screen calls `amendPlan`, which produces a **new
plan version with a new hash**. A plan is frozen; it is never edited in place.

## Two placeholders that must be replaced

**`src/lib/types.ts`** — carries the header saying it is generated from the
backend OpenAPI schema. It is hand-written for now because nothing can generate
it yet. When `/openapi.json` answers:

```bash
npm run types
```

**`src/features/brief-form/fields.ts`** — same story for field metadata.

## The fake backend

`src/lib/mockApi.ts` implements the same `Api` interface as `src/lib/api.ts`.
`src/lib/client.ts` picks one:

```bash
# frontend/.env.local
VITE_USE_MOCK=false
VITE_API_BASE=            # empty uses the dev proxy in vite.config.ts
```

Nothing else changes. The service has to answer these:

```
POST /api/briefs                     → Brief
GET  /api/briefs                     → Brief[]
POST /api/briefs/{id}/plan           → SearchPlan     (the one LLM call)
GET  /api/plans/{id}                 → SearchPlan
POST /api/plans/{id}/amend           → SearchPlan     (new version, new hash)
POST /api/plans/{id}/runs            → SearchRun
GET  /api/runs/{id}                  → SearchRun
GET  /api/runs/{id}/events           → SSE of SearchRun
GET  /api/runs/{id}/results          → RunResult[]
POST /api/results/{id}/feedback      → 204
POST /api/results/{id}/reply-draft   → ReplyDraft
GET  /api/runs/{id}/export.csv       → text/csv
```

`useRunStream` tries SSE first and falls back to polling after two consecutive
failures, so the service can ship the stream later without a frontend change.

## Rules that live in this code, not in a document

1. **The description field is required, 25 characters minimum.** Keywords alone
   make the product a word matcher and it misses the person who wrote "my bill
   exploded because I resend the whole document history every time".
2. **Nothing is spent before the plan is approved.** The brief form compiles;
   only "Looks right, run it" creates a run.
3. **Relevance multiplies.** `ScoreBreakdown` shows components, subtotal,
   multiplier, then final, in that order. The sample data includes one popular
   irrelevant post so the behaviour is visible: components add to 80, relevance
   0.02, final score 2.
4. **The evidence quote is always theirs.** Labelled "their words, not ours".
   The backend verifies the quote exists in the source before storing it.
5. **Weak matches are collapsed, never dropped, never used to pad the list.**
6. **No blank pages.** Loading, empty and failed each have a real screen.
7. **The system never posts.** `ReplyDrawer` has a Copy button and nothing else.

## Known deviation from the root README

The root README says `frontend/ React + shadcn/ui`. This is **Material UI**, on
an explicit instruction. `tailwind.config.ts` and `src/components/ui/` are
therefore unused. Either delete them or say the word and this gets rebuilt on
shadcn.
