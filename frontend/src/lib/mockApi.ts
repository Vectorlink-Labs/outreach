import type { Api } from "./api";
import {
  DRAFT_HELP_ONLY,
  DRAFT_WITH_MENTION,
  EXAMPLE_POSTS,
  EXPANSION_TERMS,
  FIRST_RESULT_MS,
  PIPELINE,
  RESULT_EVERY_MS,
  RUN_TOTAL_MS,
  SAMPLE_RESULTS,
} from "./mockData";
import type {
  Brief,
  BriefInput,
  FeedbackValue,
  PlanTerm,
  ReplyDraft,
  RunResult,
  SearchPlan,
  SearchRun,
  StageProgress,
} from "./types";

/* ================================================================== *
 * A fake backend that lives in the browser tab.
 *
 * It exists so every screen can be built, demonstrated and reviewed
 * before a single line of FastAPI is written. When the service answers,
 * set VITE_USE_MOCK=false. Nothing else changes.
 * ================================================================== */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let counter = 1;
const nextId = (prefix: string) => `${prefix}_${(counter++).toString(36).padStart(4, "0")}`;

const briefs = new Map<string, Brief>();
const plans = new Map<string, SearchPlan>();
const runs = new Map<string, { id: string; planId: string; startedAt: number }>();
const feedback = new Map<string, FeedbackValue>();

/* ---------------- plan compilation ---------------- */

function compile(brief: Brief, terms?: string[]): SearchPlan {
  const typed = terms ?? brief.keywords;
  const userTerms: PlanTerm[] = typed.map((term) => ({ term, origin: "user" }));
  const expansion = terms
    ? [] // an amended plan keeps only what the user left in
    : EXPANSION_TERMS.filter(
        (t) => !typed.some((u) => u.toLowerCase() === t.term.toLowerCase()),
      );

  const all = [...userTerms, ...expansion];
  const now = new Date();
  const from = new Date(now.getTime() - brief.daysBack * 86_400_000);

  const plan: SearchPlan = {
    id: nextId("plan"),
    briefId: brief.id,
    planHash: `sha256:${Math.abs(hash(all.map((t) => t.term).join("|"))).toString(16)}`,
    version: 1,
    terms: all,
    predicates: {
      sources: brief.sources,
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: now.toISOString().slice(0, 10),
      language: "en",
      minEngagement: 0,
      excludedTerms: ["stale-bot", "dependabot"],
    },
    stages: PIPELINE.map((s) => s.id),
    estimatedDocuments: 1600 + all.length * 42,
    estimatedCostUsd: 0.15,
    examplePosts: EXAMPLE_POSTS,
  };

  plans.set(plan.id, plan);
  briefs.set(brief.id, { ...brief, latestPlanId: plan.id });
  return plan;
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

/* ---------------- run simulation ---------------- */

function stagesAt(elapsed: number): StageProgress[] {
  return PIPELINE.map((stage, i) => {
    const from = i === 0 ? 0 : PIPELINE[i - 1].until;
    let state: StageProgress["state"] = "waiting";
    if (elapsed >= stage.until) state = "done";
    else if (elapsed >= from) state = "running";
    return { id: stage.id, label: stage.label, state, detail: stage.detail };
  });
}

function visibleResults(elapsed: number): number {
  if (elapsed < FIRST_RESULT_MS) return 0;
  return Math.min(
    SAMPLE_RESULTS.length,
    Math.floor((elapsed - FIRST_RESULT_MS) / RESULT_EVERY_MS) + 1,
  );
}

function runSnapshot(runId: string): SearchRun {
  const run = runs.get(runId);
  if (!run) throw new Error("That run no longer exists.");
  const elapsed = Date.now() - run.startedAt;
  const done = elapsed >= RUN_TOTAL_MS;
  return {
    id: run.id,
    planId: run.planId,
    state: done ? "succeeded" : "running",
    stages: stagesAt(elapsed),
    percent: Math.min(100, Math.round((elapsed / RUN_TOTAL_MS) * 100)),
    costUsd: Math.min(0.19, (elapsed / RUN_TOTAL_MS) * 0.19),
    callsUsed: Math.min(62, Math.round((elapsed / RUN_TOTAL_MS) * 62)),
    callBudget: 120,
  };
}

/* ---------------- one finished run, so /briefs is not empty ---------------- */

function seed(): void {
  if (briefs.size > 0) return;
  const brief: Brief = {
    id: nextId("brief"),
    productName: "Coalent",
    productUrl: "https://coalent.ai",
    description: "Developers whose search index goes stale after their documents change",
    keywords: ["RAG", "stale embeddings", "reindex", "token cost"],
    sources: ["github", "hackernews"],
    daysBack: 30,
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  };
  briefs.set(brief.id, brief);
  const plan = compile(brief);
  const run = { id: nextId("run"), planId: plan.id, startedAt: Date.now() - 86_400_000 };
  runs.set(run.id, run);
  briefs.set(brief.id, {
    ...briefs.get(brief.id)!,
    latestRunId: run.id,
    latestRunState: "succeeded",
    resultCount: SAMPLE_RESULTS.length,
  });
}

/* ---------------- the api ---------------- */

export const mockApi: Api = {
  async createBrief(input: BriefInput): Promise<Brief> {
    await wait(400);
    seed();
    const brief: Brief = { ...input, id: nextId("brief"), createdAt: new Date().toISOString() };
    briefs.set(brief.id, brief);
    return brief;
  },

  async listBriefs(): Promise<Brief[]> {
    await wait(280);
    seed();
    return [...briefs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async compilePlan(briefId): Promise<SearchPlan> {
    await wait(1400); // the one LLM call: term expansion
    const brief = briefs.get(briefId);
    if (!brief) throw new Error("That brief no longer exists.");
    return compile(brief);
  },

  async getPlan(planId): Promise<SearchPlan> {
    await wait(180);
    const plan = plans.get(planId);
    if (!plan) throw new Error("That plan no longer exists.");
    return plan;
  },

  async amendPlan(planId, terms): Promise<SearchPlan> {
    await wait(300);
    const previous = plans.get(planId);
    if (!previous) throw new Error("That plan no longer exists.");
    const brief = briefs.get(previous.briefId);
    if (!brief) throw new Error("That brief no longer exists.");
    const amended = compile(brief, terms);
    // an amendment is a new version of the same lineage, with a new hash
    const next: SearchPlan = { ...amended, version: previous.version + 1 };
    plans.set(next.id, next);
    return next;
  },

  async startRun(planId): Promise<SearchRun> {
    await wait(250);
    const plan = plans.get(planId);
    if (!plan) throw new Error("That plan no longer exists.");
    const run = { id: nextId("run"), planId, startedAt: Date.now() };
    runs.set(run.id, run);
    const brief = briefs.get(plan.briefId);
    if (brief) {
      briefs.set(brief.id, { ...brief, latestRunId: run.id, latestRunState: "running" });
    }
    return runSnapshot(run.id);
  },

  async getRun(runId): Promise<SearchRun> {
    return runSnapshot(runId);
  },

  async getRunResults(runId): Promise<RunResult[]> {
    const run = runs.get(runId);
    if (!run) throw new Error("That run no longer exists.");
    const elapsed = Date.now() - run.startedAt;
    return SAMPLE_RESULTS.slice(0, visibleResults(elapsed)).map((r) => ({
      ...r,
      feedback: feedback.get(r.id),
    }));
  },

  async sendFeedback(resultId, value) {
    await wait(160);
    feedback.set(resultId, value);
  },

  async draftReply(_resultId, allowMention): Promise<ReplyDraft> {
    await wait(1100); // one LLM call
    return {
      text: allowMention ? DRAFT_WITH_MENTION : DRAFT_HELP_ONLY,
      mentionsProduct: allowMention,
    };
  },

  /** No SSE in mock mode. An empty url makes useRunStream go straight to polling. */
  runEventsUrl: () => "",

  exportUrl: () => "#",
};
