/* ------------------------------------------------------------------ *
 * Products talk to the REAL backend, always.
 *
 * The rest of the app still runs on the in-browser fake, because briefs,
 * plans and runs have no service behind them yet. Products do, so there is
 * no reason to pretend. VITE_USE_MOCK does not apply here.
 *
 * Calls go to /api/... which the Vite dev server forwards to
 * http://localhost:8000 (see vite.config.ts), so there is no CORS to think
 * about while developing.
 * ------------------------------------------------------------------ */

/* The server sends the enum VALUES, which are lowercase. PostgreSQL stores
   the enum NAMES, which are uppercase. Only the JSON matters here. */
export type CrawlMode = "docs" | "site";
export type CrawlState = "queued" | "crawling" | "ready" | "thin" | "failed";

export interface ProductPage {
  id: string;
  url: string;
  title: string | null;
  wordCount: number;
  isThin: boolean;
  orderIndex: number;
  fetchedAt: string;
}

export interface ProductInput {
  name: string;
  url: string;
  description?: string;
  goal?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  inputUrl: string;
  canonicalUrl: string;
  domain: string;

  mode: CrawlMode | null;
  state: CrawlState;
  docsRoot: string | null;

  pageCount: number;
  wordCount: number;
  bytesFetched: number;
  truncated: boolean;
  stopReason: string | null;
  failureReason: string | null;
  contentHash: string | null;

  crawlStartedAt: string | null;
  crawlFinishedAt: string | null;
  createdAt: string;

  /** What the AI understood from the website. Null until the crawl finishes. */
  profile: ProductProfile | null;

  pages?: ProductPage[];
}

export interface ProductProfile {
  /** "LLM vector retrieval", "Kubernetes operators". The best repository
      search term available, and far better than the product's own name. */
  domain: string;
  summary: string;
  problems: string[];
  keywords: string[];
  painWords: string[];
  competitors: string[];
  buyer: string;
}

/** The server speaks snake_case. The screens speak camelCase. This is the seam. */
interface RawPage {
  id: string;
  url: string;
  title: string | null;
  word_count: number;
  is_thin: boolean;
  order_index: number;
  fetched_at: string;
}

interface RawProduct {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  input_url: string;
  canonical_url: string;
  domain: string;
  mode: CrawlMode | null;
  state: CrawlState;
  docs_root: string | null;
  page_count: number;
  word_count: number;
  bytes_fetched: number;
  truncated: boolean;
  stop_reason: string | null;
  failure_reason: string | null;
  content_hash: string | null;
  crawl_started_at: string | null;
  crawl_finished_at: string | null;
  created_at: string;
  profile: {
    domain?: string;
    summary?: string;
    problems?: string[];
    keywords?: string[];
    pain_words?: string[];
    competitors?: string[];
    buyer?: string;
  } | null;
  pages?: RawPage[];
}

function toProduct(raw: RawProduct): Product {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    goal: raw.goal,
    inputUrl: raw.input_url,
    canonicalUrl: raw.canonical_url,
    domain: raw.domain,
    mode: raw.mode,
    state: raw.state,
    docsRoot: raw.docs_root,
    pageCount: raw.page_count,
    wordCount: raw.word_count,
    bytesFetched: raw.bytes_fetched,
    truncated: raw.truncated,
    stopReason: raw.stop_reason,
    failureReason: raw.failure_reason,
    contentHash: raw.content_hash,
    crawlStartedAt: raw.crawl_started_at,
    crawlFinishedAt: raw.crawl_finished_at,
    createdAt: raw.created_at,
    profile: raw.profile
      ? {
          domain: raw.profile.domain ?? "",
          summary: raw.profile.summary ?? "",
          problems: raw.profile.problems ?? [],
          keywords: raw.profile.keywords ?? [],
          painWords: raw.profile.pain_words ?? [],
          competitors: raw.profile.competitors ?? [],
          buyer: raw.profile.buyer ?? "",
        }
      : null,
    pages: raw.pages?.map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title,
      wordCount: p.word_count,
      isThin: p.is_thin,
      orderIndex: p.order_index,
      fetchedAt: p.fetched_at,
    })),
  };
}

/* ---------------------------------------------------------------- plan */

export interface PlanPlatform {
  key: string;
  name: string;
  why: string;
  whatToDo: string;
  tone: string;
  searchTerms: string[];
  targetPlaces: string[];
  /** We have a connector for it. */
  searchable: boolean;
  /** The connector is built and working today. */
  availableNow: boolean;
}

export interface MarketingPlan {
  strategy: string;
  audience: string;
  positioning: string;
  platforms: PlanPlatform[];
  contentIdeas: string[];
  firstWeek: string[];
}

export interface PlanResult {
  plan: MarketingPlan;
  /** The product changed after the plan was written. Shown, never acted on. */
  stale: boolean;
  madeAt: string | null;
}

interface RawPlatform {
  key: string;
  name: string;
  why: string;
  what_to_do: string;
  tone: string;
  search_terms: string[];
  target_places: string[];
  searchable: boolean;
  available_now: boolean;
}

interface RawPlanResult {
  plan: {
    strategy: string;
    audience: string;
    positioning: string;
    platforms: RawPlatform[];
    content_ideas: string[];
    first_week: string[];
  };
  stale: boolean;
  made_at: string | null;
}

function toPlan(raw: RawPlanResult): PlanResult {
  return {
    stale: raw.stale,
    madeAt: raw.made_at,
    plan: {
      strategy: raw.plan.strategy,
      audience: raw.plan.audience,
      positioning: raw.plan.positioning,
      contentIdeas: raw.plan.content_ideas ?? [],
      firstWeek: raw.plan.first_week ?? [],
      platforms: (raw.plan.platforms ?? []).map((p) => ({
        key: p.key,
        name: p.name,
        why: p.why,
        whatToDo: p.what_to_do,
        tone: p.tone,
        searchTerms: p.search_terms ?? [],
        targetPlaces: p.target_places ?? [],
        searchable: p.searchable,
        availableNow: p.available_now,
      })),
    },
  };
}

const BASE = "/api/v1";

/** Thrown with the server's own message, so the screen can show it verbatim. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      // The session is an httpOnly cookie. Without this, every call is
      // anonymous and every endpoint answers 401.
      credentials: "include",
      ...init,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the backend. Start it with: uvicorn outreach.main:app --reload",
      0,
    );
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* not json, keep the status line */
    }
    // The session went away mid-use. Tell the app so it can send them to
    // the login page with an explanation, rather than showing a red box on
    // a screen that still looks signed in.
    if (response.status === 401) {
      window.dispatchEvent(new Event("outreach:unauthorised"));
    }

    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const productApi = {
  async isBackendUp(): Promise<boolean> {
    try {
      await request<{ status: string }>("/health");
      return true;
    } catch {
      return false;
    }
  },

  async list(): Promise<Product[]> {
    const raw = await request<RawProduct[]>("/products");
    return raw.map(toProduct);
  },

  async get(id: string): Promise<Product> {
    return toProduct(await request<RawProduct>(`/products/${id}`));
  },

  async create(input: ProductInput): Promise<Product> {
    const raw = await request<RawProduct>("/products", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        url: input.url,
        description: input.description || null,
        goal: input.goal || null,
      }),
    });
    return toProduct(raw);
  },

  async recrawl(id: string): Promise<Product> {
    return toProduct(await request<RawProduct>(`/products/${id}/recrawl`, { method: "POST" }));
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/products/${id}`, { method: "DELETE" });
  },

  async markdown(id: string): Promise<string> {
    const response = await fetch(`${BASE}/products/${id}/markdown`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new ApiError(`Could not load the document (${response.status}).`, response.status);
    }
    return response.text();
  },

  markdownUrl(id: string): string {
    return `${BASE}/products/${id}/markdown`;
  },

  /** The marketing plan, or null when one has not been written yet. */
  async plan(id: string): Promise<PlanResult | null> {
    try {
      return toPlan(await request<RawPlanResult>(`/products/${id}/plan`));
    } catch (error) {
      // 404 here means "not written yet", which every caller treats as a
      // state rather than a failure. Anything else is a real error.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  /**
   * Ask for a plan. Returns immediately; the writing happens in the
   * background and takes 20-40 seconds. Poll `plan()` for the result.
   */
  async makePlan(id: string, force = false): Promise<void> {
    await request<{ status: string }>(
      `/products/${id}/plan${force ? "?force=true" : ""}`,
      { method: "POST" },
    );
  },

  /**
   * Start searching a platform.
   *
   * `terms` and `repos` override what the plan chose. Omitted, the plan's
   * own choices run.
   */
  async findOpportunities(
    id: string,
    platform: string,
    terms?: string[],
    repos?: string[],
  ): Promise<string> {
    const out = await request<{ run_id: string }>(`/products/${id}/opportunities`, {
      method: "POST",
      body: JSON.stringify({ platform, terms, repos }),
    });
    return out.run_id;
  },

  async opportunityRun(runId: string): Promise<OpportunityRun> {
    return request<OpportunityRun>(`/opportunities/${runId}`);
  },

  /**
   * Repositories GitHub actually has for a topic.
   *
   * The planner names these from memory, which produces renamed projects,
   * wrong organisations, and famous-but-irrelevant repos. This asks GitHub.
   */
  async suggestRepos(topic: string, minStars = 500): Promise<RepoSuggestion[]> {
    const q = new URLSearchParams({
      q: topic,
      min_stars: String(minStars),
      limit: "12",
    });
    return request<RepoSuggestion[]>(`/sources/github/repos?${q}`);
  },
};

export interface RepoSuggestion {
  full_name: string;
  description: string;
  stars: number;
  open_issues: number;
}

/* -------------------------------------------------------- opportunities */

export interface Opportunity {
  id: string;
  rank: number;
  score: number;
  band: "very-high" | "high" | "medium" | "weak";
  url: string;
  /** "issue" or "discussion" — replying to each is a different act. */
  kind: string;
  /** A discussion's category: "Q&A", "Ideas", ... Null for issues. */
  category: string | null;
  /**
   * Null when the thread cannot be answered (issues, non-Q&A categories).
   * False is the interesting value: a question nobody has answered yet.
   */
  is_answered: boolean | null;
  title: string;
  author: string;
  container: string | null;
  created_at: string;
  engagement: string;
  problem: string;
  evidence_quote: string;
  intent: string | null;
  domain: string | null;
  asking_for_help: boolean;
  product_fit: number;
  reason: string;
  explain: string;
}

export interface OpportunityStage {
  id: string;
  label: string;
  state: "waiting" | "running" | "done" | "skipped";
  detail: string | null;
}

export interface OpportunityRun {
  id: string;
  platform: string;
  state: "queued" | "running" | "succeeded" | "failed";
  stages: OpportunityStage[];
  percent: number;
  /** What each query returned and what was dropped. Read this first when
      the result count is surprising. */
  notes: string[];
  results: Opportunity[];
  error: string | null;
}

/** True while the crawl is still going, so the screen knows to keep polling. */
export function isRunning(product: Product): boolean {
  return product.state === "queued" || product.state === "crawling";
}
