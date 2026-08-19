import type {
  ExamplePost,
  PlanTerm,
  RunResult,
  ScoreComponent,
  ScoreDetail,
  SourceOption,
  StageId,
} from "./types";
import { bandOf } from "./types";

/* ================================================================== *
 * Sample data for the in-browser fake backend.
 * The posts and the quotes are real, from the August GitHub sweep.
 * Delete this file the day the FastAPI service answers.
 * ================================================================== */

export const SOURCE_OPTIONS: SourceOption[] = [
  { id: "github", label: "GitHub issues" },
  { id: "hackernews", label: "Hacker News" },
  {
    id: "reddit",
    label: "Reddit",
    disabled: true,
    reason: "Commercial use of their data requires an agreement",
  },
];

export const DATE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
] as const;

/** Pre-ticked on the brief form. */
export const DEFAULT_KEYWORDS: string[] = [
  "RAG",
  "stale embeddings",
  "reindex",
  "token cost",
];

/** Offered while typing. The plainer words are the ones that actually find leads. */
export const SUGGESTED_KEYWORDS: string[] = [
  "delete document",
  "hard delete",
  "incremental update",
  "incremental indexing",
  "supersede",
  "contradictory",
  "invalidation",
  "cache invalidation",
  "outdated context",
  "re-embed",
  "refresh index",
  "document changed",
  "provenance",
  "source of truth",
  "vector store update",
];

/* ---------------- the plan the compiler would produce ---------------- */

export const EXPANSION_TERMS: PlanTerm[] = [
  {
    term: "delete document",
    origin: "expansion",
    reason: "The most common way people describe invalidation without naming it",
  },
  {
    term: "incremental indexing",
    origin: "expansion",
    reason: "What maintainers call the feature your users are asking for",
  },
  {
    term: "supersede",
    origin: "expansion",
    reason: "Used when a newer fact should replace an older one",
  },
  {
    term: "contradictory",
    origin: "expansion",
    reason: "How people describe two versions of a fact coexisting",
  },
  {
    term: "outdated context",
    origin: "expansion",
    reason: "Frequent phrasing for an answer built from an old source",
  },
  {
    term: "re-embed",
    origin: "expansion",
    reason: "Cost complaints say this far more often than reindex",
  },
  {
    term: "document changed",
    origin: "expansion",
    reason: "Plain wording for the trigger event",
  },
  {
    term: "refresh index",
    origin: "expansion",
    reason: "Common in LlamaIndex and Haystack threads",
  },
  {
    term: "cache invalidation",
    origin: "expansion",
    reason: "Exact phrase, low volume, kept because the few hits are strong",
  },
  {
    term: "vector store update",
    origin: "expansion",
    reason: "How the problem is titled in most issue trackers",
  },
  {
    term: "source of truth",
    origin: "expansion",
    reason: "Appears when someone is deciding what to trust after an edit",
  },
];

export const EXAMPLE_POSTS: ExamplePost[] = [
  {
    source: "github",
    title: "Answers still cite a document I deleted last week",
    body: "We hard-deleted a policy PDF from the corpus and re-ran ingestion. Search still asserts facts from it. Re-asking the identical question after the delete returns the cached pre-delete answer word for word. Is there a way to invalidate downstream answers when a source is removed?",
  },
  {
    source: "hackernews",
    title: "Our LLM bill went 4x and I think it is our own fault",
    body: "We resend the whole document history on every request because we could not work out which parts had actually changed. Costs went from a few hundred a month to four figures. How do people decide what to send again and what to reuse?",
  },
  {
    source: "github",
    title: "Nightly rebuild takes six hours for a handful of edited files",
    body: "40k markdown files, maybe twenty change a day. We rebuild the whole index every night because we do not trust our change detection. Is there a sane way to only re-embed what actually changed, including deletions?",
  },
];

/* ---------------- the pipeline, from the repo README ---------------- */

export const PIPELINE: Array<{
  id: StageId;
  label: string;
  until: number;
  detail: string;
}> = [
  { id: "expand", label: "Expand terms", until: 200, detail: "frozen into the plan" },
  { id: "coverage", label: "Check coverage", until: 500, detail: "11 pools" },
  { id: "fetch", label: "Fetch from sources", until: 3600, detail: "→ 2,014" },
  { id: "normalize", label: "Normalise", until: 3900, detail: "one shape" },
  { id: "dedupe", label: "Deduplicate", until: 4300, detail: "2,014 → 1,186" },
  { id: "embed", label: "Embed new documents", until: 4900, detail: "312 new" },
  { id: "retrieve", label: "Retrieve", until: 5300, detail: "words + meaning" },
  { id: "fuse", label: "Fuse the two lists", until: 5500, detail: "1,186 → 312" },
  { id: "rerank", label: "Rerank", until: 6000, detail: "312 → 60 · $0.006" },
  { id: "analyze", label: "Analyse the survivors", until: 9000, detail: "top 25 · $0.20" },
  { id: "score", label: "Score", until: 9200, detail: "5 components × relevance" },
  { id: "diversify", label: "Diversify", until: 9350, detail: "cap per author" },
  { id: "synthesize", label: "Synthesise", until: 9500, detail: "evidence quotes" },
  { id: "persist", label: "Persist", until: 9700, detail: "25 → 20 shown" },
];

export const RUN_TOTAL_MS = 9700;
export const FIRST_RESULT_MS = 6000;
export const RESULT_EVERY_MS = 420;

/* ---------------- scoring ---------------- */

const WEIGHTS: Array<[string, number]> = [
  ["Actively looking", 0.35],
  ["Pain severity", 0.2],
  ["Right kind of person", 0.15],
  ["Recency", 0.15],
  ["Attention", 0.15],
];

/**
 * Relevance MULTIPLIES the weighted subtotal. Keeping the arithmetic in one
 * place means the number on the card can never disagree with the breakdown.
 * The backend owns the real version in domain/scoring.py.
 */
function detail(relevance: number, raws: number[]): ScoreDetail {
  const components: ScoreComponent[] = WEIGHTS.map(([name, weight], i) => ({
    name,
    raw: raws[i],
    weight,
    points: Math.round(raws[i] * weight * 10_000) / 100,
  }));
  const subtotal = Math.round(components.reduce((s, c) => s + c.points, 0) * 100) / 100;
  return { components, relevance, subtotal, final: Math.round(relevance * subtotal) };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

interface Seed {
  source: RunResult["conversation"]["source"];
  url: string;
  title: string;
  author: string;
  ageDays: number;
  engagement: string;
  problem: string;
  activelyLooking: boolean;
  painSeverity: number;
  productFit: number;
  relevance: number;
  raws: [number, number, number, number, number];
  evidenceQuote: string;
}

const SEEDS: Seed[] = [
  {
    source: "hackernews",
    url: "https://news.ycombinator.com/item?id=41999001",
    title: "We re-send the whole doc history on every request and our bill went 4x",
    author: "mkurtz",
    ageDays: 2,
    engagement: "41 points · 12 replies",
    problem: "Repeated context is inflating token cost on every call",
    activelyLooking: true,
    painSeverity: 4,
    productFit: 0.94,
    relevance: 0.94,
    raws: [0.95, 0.9, 0.85, 0.95, 0.8],
    evidenceQuote: "our bill went 4x after we added history",
  },
  {
    source: "github",
    url: "https://github.com/run-llama/llama_index/issues/22639",
    title: "A failed re-ingest deletes the document from the index entirely",
    author: "dfm88",
    ageDays: 6,
    engagement: "1 comment",
    problem:
      "delete_ref_doc runs before the transformation pipeline, so a failed rebuild loses the indexed version",
    activelyLooking: true,
    painSeverity: 4,
    productFit: 0.91,
    relevance: 0.93,
    raws: [0.85, 0.8, 0.95, 0.85, 0.3],
    evidenceQuote:
      "a failed re-ingest should leave the previously indexed version untouched; actual: the document disappears from the index entirely",
  },
  {
    source: "github",
    url: "https://github.com/topoteretes/cognee/issues/4030",
    title:
      "Search keeps asserting facts from a document after that document has been hard-deleted",
    author: "rstover-fo",
    ageDays: 31,
    engagement: "1 comment",
    problem:
      "A cache in front of search still serves the pre-delete answer after the source is gone",
    activelyLooking: true,
    painSeverity: 5,
    productFit: 0.97,
    relevance: 0.98,
    raws: [0.8, 0.95, 0.9, 0.45, 0.35],
    evidenceQuote:
      "re-asking the identical question after the delete returns the cached pre-delete answer verbatim",
  },
  {
    source: "github",
    url: "https://github.com/mem0ai/mem0/issues/4956",
    title: "Contradictory memories accumulate instead of the newer fact winning",
    author: "NDNM1408",
    ageDays: 9,
    engagement: "6 comments",
    problem: "Retrieval ranks an outdated fact above the newer one because recency is not scored",
    activelyLooking: true,
    painSeverity: 4,
    productFit: 0.88,
    relevance: 0.9,
    raws: [0.75, 0.8, 0.8, 0.7, 0.65],
    evidenceQuote:
      "contradictory memories accumulate over time instead of the newer fact superseding the older one",
  },
  {
    source: "github",
    url: "https://github.com/langchain-ai/langchain/issues/32612",
    title: "Incremental indexing re-embeds every chunk after the first batch",
    author: "shkarupa-alex",
    ageDays: 9,
    engagement: "5 comments",
    problem: "The record manager marks unchanged chunks as missing, so they are rebuilt every run",
    activelyLooking: true,
    painSeverity: 3,
    productFit: 0.79,
    relevance: 0.82,
    raws: [0.7, 0.75, 0.85, 0.7, 0.6],
    evidenceQuote:
      "every chunk after the first batch is treated as 'not found' and then deleted + embedded (CPU/GPU heavy) and inserted back",
  },
  {
    source: "github",
    url: "https://github.com/langchain-ai/langgraph/issues/8214",
    title: "Old vector for a document survives the update",
    author: "onyx679",
    ageDays: 25,
    engagement: "4 comments",
    problem: "Updating a document leaves the previous embedding in the store",
    activelyLooking: false,
    painSeverity: 3,
    productFit: 0.74,
    relevance: 0.78,
    raws: [0.65, 0.7, 0.8, 0.55, 0.55],
    evidenceQuote:
      "the old vector for doc1 remains in _vectors, so doc1 can still be returned with a similarity score for the old text",
  },
  {
    source: "github",
    url: "https://github.com/deepset-ai/haystack/issues/11476",
    title: "Re-indexing re-embeds chunks identical to the previous run",
    author: "Aarkin7",
    ageDays: 46,
    engagement: "3 comments",
    problem: "No content hash check, so an unchanged chunk pays the embedding cost again",
    activelyLooking: false,
    painSeverity: 2,
    productFit: 0.68,
    relevance: 0.7,
    raws: [0.6, 0.6, 0.75, 0.35, 0.45],
    evidenceQuote:
      "re-indexing after a cleaner/splitter change, where most resulting chunks are identical to the previous run",
  },
  {
    // Kept on purpose. Popular, recent, well written, completely irrelevant.
    // Components add to 80. Relevance 0.02 takes it to 2.
    // If relevance were a sixth weighted component it would score about 67
    // and sit on the first page. That is the bug this design exists to avoid.
    source: "hackernews",
    url: "https://news.ycombinator.com/item?id=41999444",
    title: "Show HN: I rebuilt my blog in Rust and it loads in 4ms",
    author: "fastblog",
    ageDays: 1,
    engagement: "312 points · 180 replies",
    problem: "Front-end performance. No retrieval or freshness angle at all.",
    activelyLooking: false,
    painSeverity: 1,
    productFit: 0.02,
    relevance: 0.02,
    raws: [0.9, 0.6, 0.5, 1.0, 0.95],
    evidenceQuote: "it loads in 4ms on a cold cache",
  },
];

export const SAMPLE_RESULTS: RunResult[] = SEEDS.map((seed, i) => {
  const scoreDetail = detail(seed.relevance, seed.raws);
  return {
    id: `res_${1000 + i}`,
    rank: 0,
    score: scoreDetail.final,
    band: bandOf(scoreDetail.final),
    conversation: {
      source: seed.source,
      url: seed.url,
      title: seed.title,
      author: seed.author,
      createdAt: daysAgo(seed.ageDays),
      engagement: seed.engagement,
    },
    problem: seed.problem,
    activelyLooking: seed.activelyLooking,
    painSeverity: seed.painSeverity,
    productFit: seed.productFit,
    evidenceQuote: seed.evidenceQuote,
    scoreDetail,
  };
})
  .sort((a, b) => b.score - a.score)
  .map((r, i) => ({ ...r, rank: i + 1 }));

/* ---------------- reply drafts ---------------- */

export const DRAFT_HELP_ONLY = `That sounds like two caches, not one. The delete removed the record from the store, but if anything caches the answer in front of search, nothing tells it the source went away, so the pre-delete answer keeps getting served.

Quick way to tell which layer it is: ask the same question with slightly different wording. If the reworded one says it does not know and the original still answers, the store is clean and the cache is your bug.

If that is it, key cache entries by the source ids they were built from, not just the query text. Store the document ids alongside each entry, and on delete drop every entry whose id list contains that document. Small table, exact deletes.`;

export const DRAFT_WITH_MENTION = `${DRAFT_HELP_ONLY}

Full disclosure, I build a tool for exactly this layer. It keeps span level provenance from each cached fact back to the source, so a delete or an edit invalidates only the facts from that source and the rest of the cache stays warm. Honest limit so you can judge it: accuracy matches plain RAG, it does not beat it. The win is freshness and fewer context tokens.

If it does not fit, the by hand route above is still the right baseline.`;
