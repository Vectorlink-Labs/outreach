import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SearchIcon from "@mui/icons-material/Search";

import { BAND_COLOR, WEAK_BELOW, platformName } from "@/features/opportunities/band";
import LeadActions from "@/features/opportunities/LeadActions";
import {
  productApi,
  type Lead,
  type Opportunity,
  type OpportunityRun,
} from "@/lib/productApi";
import { MONO } from "@/styles/theme";

const POLL_MS = 2000;

/**
 * How long to wait before saying something is wrong.
 *
 * Two different waits, because the two silences mean different things. No
 * reply at all is nearly always the backend having restarted under the
 * request, and thirty seconds is already far past normal. A run that IS
 * answering but has not finished is merely slow - a big fetch against
 * GitHub's rate limit genuinely takes minutes - so that one waits much
 * longer before casting doubt on itself.
 */
const NO_REPLY_MS = 30_000;
const TOO_LONG_MS = 6 * 60_000;

export default function OpportunitiesRoute() {
  const [params] = useSearchParams();
  const productId = params.get("product") ?? "";
  const platform = params.get("platform") ?? "github";
  /* "|" rather than "," because a repository name never contains one and a
   * search phrase easily might.
   *
   * `undefined` when the parameter is absent, and that distinction is the
   * whole point. The server reads a missing list as "use whatever the plan
   * says" and an empty list as "search nothing, deliberately" - which is a
   * real thing to ask for, as in "these repositories only, no phrases".
   *
   * Returning `[]` for an absent parameter collapsed the two. The home
   * page's Search again button links here without terms, the empty array
   * overrode a perfectly good plan of nine phrases and twenty repositories,
   * and the run died with "The plan has no search terms for this platform"
   * against a plan that had plenty. */
  const split = (key: string): string[] | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    return raw.split("|").map((s) => s.trim()).filter(Boolean);
  };
  const terms = split("terms");
  const repos = split("repos");

  /* Two ways in. `?run=` reopens a search that already happened, which is
     how the home page links to its last result; anything else starts a new
     one. Without the distinction, opening yesterday's results would silently
     spend a fresh run. */
  const existingRunId = params.get("run") ?? "";

  const [run, setRun] = useState<OpportunityRun | null>(null);
  /* The lead row for each result, keyed by GitHub node id.
   *
   * A run holds what a search found; a lead holds what you did about
   * it. They are joined on `source_id`, which the results already carry
   * as `id` - the key existed long before the table did. */
  const [leads, setLeads] = useState<Record<string, Lead>>({});
  const [error, setError] = useState<string | null>(null);

  /* What this screen has already acted on.
   *
   * A boolean "have I started yet" is not enough, because going from a
   * saved run to a new search is a change of query string on the SAME
   * route: React keeps the component mounted, so a plain flag stays true
   * and the new search never starts. Comparing the request instead means
   * a repeat is ignored and a genuine change is honoured.
   *
   * It still covers the case the flag was there for: React runs effects
   * twice in development, and both passes carry the same key. */
  const requestKey = existingRunId
    ? `open:${existingRunId}`
    : `start:${productId}:${platform}`;
  const actedOn = useRef("");
  const pollRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (actedOn.current === requestKey) return;
    if (!existingRunId && !productId) return;
    actedOn.current = requestKey;

    /* Staleness is decided by comparing the request, never by a flag the
     * cleanup sets.
     *
     * A `cancelled` boolean is the obvious way to write this and it is
     * broken here, because React runs effects twice in development. Pass one
     * would start the work, the cleanup between the passes would set
     * `cancelled`, pass two would take the guard above and return without
     * doing anything, and pass one's answer would then arrive and be thrown
     * away for being "cancelled". Nothing ever called `setRun`, so `run`
     * stayed null - and this screen shows the progress card whenever `run`
     * is null, which is why reopening a finished search looked exactly like
     * starting a new one.
     *
     * Comparing `actedOn` instead makes the double pass harmless: it still
     * refers to this request, so the answer is kept. Only a genuine change
     * of query string moves it, and that is the one case where an in-flight
     * answer really is stale. */
    const mine = requestKey;
    const stillMine = () => actedOn.current === mine;

    const watch = (runId: string) => {
      window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        if (!stillMine()) {
          window.clearInterval(pollRef.current);
          return;
        }
        try {
          const next = await productApi.opportunityRun(runId);
          if (!stillMine()) return;
          setRun(next);
          if (next.state === "succeeded" || next.state === "failed") {
            window.clearInterval(pollRef.current);
          }
        } catch (e) {
          window.clearInterval(pollRef.current);
          if (stillMine()) setError(e instanceof Error ? e.message : String(e));
        }
      }, POLL_MS);
    };

    setRun(null);
    setError(null);

    (async () => {
      try {
        if (existingRunId) {
          // Reopening. This must never start a search - it is how the home
          // page links to a result somebody already paid for.
          const found = await productApi.opportunityRun(existingRunId);
          if (!stillMine()) return;
          setRun(found);
          if (found.state !== "succeeded" && found.state !== "failed") {
            watch(existingRunId);
          }
          return;
        }

        const runId = await productApi.findOpportunities(
          productId,
          platform,
          terms,
          repos,
        );
        if (!stillMine()) return;
        watch(runId);
      } catch (e) {
        if (stillMine()) setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [productId, platform, existingRunId, requestKey]);

  // The interval outlives the effect that created it, so it is cleared on
  // unmount rather than between the development double-pass.
  useEffect(() => () => window.clearInterval(pollRef.current), []);

  /* Leads, once the run has told us which product it belongs to.
   *
   * Deliberately not part of the polling loop above. Lead state changes
   * when a person presses a button, not while a search runs, so re-reading
   * it every two seconds would undo an optimistic update mid-click. */
  const forProduct = run?.product_id;
  useEffect(() => {
    if (!forProduct) return;
    let alive = true;
    (async () => {
      try {
        const found = await productApi.leads(forProduct);
        if (!alive) return;
        setLeads(Object.fromEntries(found.leads.map((l) => [l.source_id, l])));
      } catch {
        // A results page that cannot reach the lead list is still a results
        // page. The buttons simply do not appear.
      }
    })();
    return () => {
      alive = false;
    };
  }, [forProduct]);

  const onLeadChanged = useCallback((lead: Lead) => {
    setLeads((prev) => ({ ...prev, [lead.source_id]: lead }));
  }, []);

  const results = run?.results ?? [];
  const strong = results.filter((r) => r.score >= WEAK_BELOW);
  const weak = results.filter((r) => r.score < WEAK_BELOW);
  const done = run?.state === "succeeded";

  // Whether anything is actually working right now. A reopened run that has
  // already finished is not, and showing it the progress card made a saved
  // result look exactly like a search starting from scratch.
  const live = !run || run.state === "queued" || run.state === "running";

  // Has it gone quiet for longer than it should have?
  const [waitedMs, setWaitedMs] = useState(0);
  useEffect(() => {
    if (!live) {
      setWaitedMs(0);
      return;
    }
    const started = Date.now();
    const tick = window.setInterval(() => setWaitedMs(Date.now() - started), POLL_MS);
    return () => window.clearInterval(tick);
  }, [live, requestKey]);

  const silent = live && waitedMs > (run ? TOO_LONG_MS : NO_REPLY_MS);

  // The URL only carries a platform when a search is being started. Reopened
  // by id it does not, and the page said "GitHub" for every run regardless
  // of what it actually searched.
  const shown = run?.platform ?? platform;
  const backTo = productId || run?.product_id || "";

  return (
    <Stack
      gap={3}
      sx={{
        maxWidth: 900,
        mx: "auto",
        width: "100%",
        px: { xs: 2, sm: 3 },
        py: { xs: 3, md: 5 },
      }}
    >
      <Box>
        {/* Which product this belongs to is not always known yet.
            Reopening by run id carries no product in the URL, so until the
            run loads there is nothing to go back *to* - and building the
            link anyway produced "/products//plan", which matches no route
            and falls through to the catch-all redirect to the landing page.
            Home is a truthful destination while we do not know better. */}
        <Button
          component={RouterLink}
          to={backTo ? `/products/${backTo}/plan` : "/home"}
          startIcon={<ArrowBackIcon />}
          size="small"
          sx={{ mb: 1 }}
        >
          {backTo ? "Back to the plan" : "Back"}
        </Button>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "flex-end" }}
          gap={2}
        >
          <Box>
            <Typography variant="h4" sx={{ fontSize: 30 }}>
              Opportunities on {platformName(shown)}
            </Typography>

            {/* Says which search this is. Without it a saved run and a new
                one are the same screen, and reopening yesterday's results
                reads as having spent another search. */}
            {existingRunId && run?.started_at ? (
              <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
                <HistoryIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {live
                    ? `Started ${fullWhen(run.started_at)} — still running, nothing new was spent`
                    : `Saved search from ${fullWhen(run.started_at)} · ${results.length} found`}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                People publicly describing the problem your product solves.
              </Typography>
            )}
          </Box>

          {/* Only offered once nothing is running, so it cannot be pressed
              by somebody who thinks they are cancelling. */}
          {!live && backTo && (
            <Button
              component={RouterLink}
              to={`/opportunities?product=${backTo}&platform=${shown}`}
              variant="outlined"
              startIcon={<SearchIcon />}
              sx={{ flexShrink: 0 }}
            >
              Run a new search
            </Button>
          )}
        </Stack>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {run?.error && <Alert severity="error">{run.error}</Alert>}

      {live && !error && (
        <Card variant="outlined">
          <CardContent>
            <LinearProgress
              variant={run ? "determinate" : "indeterminate"}
              value={run?.percent ?? 0}
              sx={{ mb: 2.5 }}
            />
            <Stack gap={1}>
              {(run?.stages ?? []).map((stage) => (
                <Stack key={stage.id} direction="row" alignItems="center" gap={1.5}>
                  {stage.state === "done" ? (
                    <CheckCircleIcon fontSize="small" color="success" />
                  ) : (
                    <RadioButtonUncheckedIcon
                      fontSize="small"
                      color={stage.state === "running" ? "primary" : "disabled"}
                    />
                  )}
                  <Typography
                    variant="body2"
                    color={stage.state === "waiting" ? "text.disabled" : "text.primary"}
                  >
                    {stage.label}
                  </Typography>
                  {stage.detail && (
                    <Typography variant="caption" color="text.secondary">
                      {stage.detail}
                    </Typography>
                  )}
                </Stack>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
              A few minutes. GitHub is rate limited, every candidate's title is
              read, and the best of them are read in full.
            </Typography>

            {/* A search whose first reply never arrives used to spin here for
                ever: the card shows whenever there is no run yet, and "no run
                yet" and "no answer ever" looked identical. Restarting the
                backend mid-search is enough to cause it, and the search
                itself usually finished perfectly well server-side. */}
            {silent && (
              <Alert
                severity="warning"
                sx={{ mt: 2 }}
                action={
                  <Button
                    size="small"
                    onClick={() => window.location.reload()}
                  >
                    Reload
                  </Button>
                }
              >
                {run
                  ? "This has been running much longer than usual. It may still finish — the results are saved either way, so reloading is safe."
                  : "No reply from the backend yet. If it was restarted, the search may already have finished and been saved. Reload to check."}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {done && (
        <>
          <Typography variant="body2" color="text.secondary">
            {strong.length > 0
              ? `${strong.length} worth looking at${weak.length ? `, ${weak.length} weak` : ""}.`
              : "Nothing scored well enough to recommend."}
          </Typography>

          {strong.map((o) => (
            <OpportunityCard
              key={o.id}
              opportunity={o}
              lead={leads[o.id]}
              onLeadChanged={onLeadChanged}
            />
          ))}

          {strong.length === 0 && weak.length === 0 && (
            <Alert severity="info">
              No results. The plan's search terms may be too narrow — try
              rewriting the plan, or widen the terms by hand.
            </Alert>
          )}

          {weak.length > 0 && (
            <Accordion variant="outlined" disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" color="text.secondary">
                  {weak.length} weak matches — shown so you can check what was
                  set aside
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack gap={2}>
                  {weak.map((o) => (
                    <OpportunityCard
              key={o.id}
              opportunity={o}
              lead={leads[o.id]}
              onLeadChanged={onLeadChanged}
            />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}

          {(run?.notes.length ?? 0) > 0 && (
            <Accordion variant="outlined" disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" color="text.secondary">
                  What the search actually did
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack gap={0.5}>
                  {run?.notes.map((note, i) => (
                    <Typography key={i} sx={{ fontFamily: MONO, fontSize: 12 }}>
                      {note}
                    </Typography>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
        </>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ */

function OpportunityCard({
  opportunity: o,
  lead,
  onLeadChanged,
}: {
  opportunity: Opportunity;
  lead: Lead | undefined;
  onLeadChanged: (lead: Lead) => void;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" gap={2.5}>
          <Box sx={{ textAlign: "center", minWidth: 56 }}>
            <Typography
              sx={{
                fontFamily: MONO,
                fontSize: 26,
                fontWeight: 600,
                lineHeight: 1,
                color: o.score >= 45 ? "error.main" : "text.secondary",
              }}
            >
              {o.score}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              score
            </Typography>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Link
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
            >
              <Typography variant="h6" sx={{ fontSize: 17 }}>
                {o.title}
              </Typography>
              <OpenInNewIcon sx={{ fontSize: 15 }} />
            </Link>

            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.75, mb: 1.5 }}>
              <Chip size="small" label={o.band} color={BAND_COLOR[o.band]} variant="outlined" />
              {/* Which kind of thread this is. Worth its own chip because
                  replying differs: an issue reply is a bug-tracker comment,
                  a discussion reply is a forum answer. */}
              {o.kind === "discussion" && (
                <Chip size="small" label={o.category ?? "discussion"} color="info" variant="outlined" />
              )}
              {/* A Hacker News comment is titled by its own opening line, so
                  without this there is nothing on the card saying it is a
                  reply in somebody else's thread rather than a post. */}
              {o.kind === "comment" && (
                <Chip size="small" label="comment" color="info" variant="outlined" />
              )}
              {/* Only ever shown when false — an unanswered question is a gap
                  to fill, which is the whole reason to turn up. */}
              {o.is_answered === false && (
                <Chip size="small" label="unanswered" color="success" variant="outlined" />
              )}
              {o.intent && <Chip size="small" label={o.intent} variant="outlined" />}
              {o.domain && (
                <Chip size="small" label={o.domain} variant="outlined" sx={{ fontSize: 11 }} />
              )}
            </Stack>

            <Typography sx={{ fontFamily: MONO, fontSize: 11.5, color: "text.secondary", mb: 1.5 }}>
              {o.kind === "comment" ? "in " : ""}
              {o.container} · @{o.author} · {o.engagement}
            </Typography>

            {o.problem && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  Their problem
                </Typography>
                <Typography variant="body2">{o.problem}</Typography>
              </Box>
            )}

            {o.evidence_quote && (
              <Box
                sx={{
                  borderLeft: 2,
                  borderColor: "divider",
                  pl: 1.5,
                  py: 0.5,
                  mb: 1.5,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  Their words, not ours
                </Typography>
                <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                  “{o.evidence_quote}”
                </Typography>
              </Box>
            )}

            {o.reason && (
              <Typography variant="body2" color="text.secondary">
                {o.reason}
              </Typography>
            )}

            {/* Last, and below a rule: the judgement is what you read, this
                is what you do about it once you have. */}
            <Box
              sx={{
                mt: 2,
                pt: 1.5,
                borderTop: 1,
                borderColor: "divider",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <LeadActions lead={lead} onChanged={onLeadChanged} />
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/** "1 Sep at 2:25 pm". Enough to tell two runs on the same day apart. */
function fullWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}
