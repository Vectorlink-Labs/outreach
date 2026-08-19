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

export interface Product {
  id: string;
  name: string;
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

  pages?: ProductPage[];
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
  pages?: RawPage[];
}

function toProduct(raw: RawProduct): Product {
  return {
    id: raw.id,
    name: raw.name,
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

  async create(name: string, url: string): Promise<Product> {
    const raw = await request<RawProduct>("/products", {
      method: "POST",
      body: JSON.stringify({ name, url }),
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
    const response = await fetch(`${BASE}/products/${id}/markdown`);
    if (!response.ok) {
      throw new ApiError(`Could not load the document (${response.status}).`, response.status);
    }
    return response.text();
  },

  markdownUrl(id: string): string {
    return `${BASE}/products/${id}/markdown`;
  },
};

/** True while the crawl is still going, so the screen knows to keep polling. */
export function isRunning(product: Product): boolean {
  return product.state === "queued" || product.state === "crawling";
}
