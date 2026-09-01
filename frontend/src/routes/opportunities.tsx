import { useEffect, useRef, useState } from "react";
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

import { BAND_COLOR, WEAK_BELOW } from "@/features/opportunities/band";
import { productApi, type Opportunity, type OpportunityRun } from "@/lib/productApi";
import { MONO } from "@/styles/theme";

const POLL_MS = 2000;

export default function OpportunitiesRoute() {
  const [params] = useSearchParams();
  const productId = params.get("product") ?? "";
  const platform = params.get("platform") ?? "github";
  // "|" rather than "," because a repository name never contains one and
  // a search phrase easily might.
  const split = (key: string) =>
    (params.get(key) ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const terms = split("terms");
  const repos = split("repos");

  /* Two ways in. `?run=` reopens a search that already happened, which is
     how the home page links to its last result; anything else starts a new
     one. Without the distinction, opening yesterday's results would silently
     spend a fresh run. */
  const existingRunId = params.get("run") ?? "";

  const [run, setRun] = useState<OpportunityRun | null>(null);
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

  useEffect(() => {
    if (actedOn.current === requestKey) return;
    if (!existingRunId && !productId) return;
    actedOn.current = requestKey;

    let poll: number | undefined;
    let cancelled = false;

    const watch = (runId: string) => {
      poll = window.setInterval(async () => {
        try {
          const next = await productApi.opportunityRun(runId);
          if (cancelled) return;
          setRun(next);
          if (next.state === "succeeded" || next.state === "failed") {
            window.clearInterval(poll);
          }
        } catch (e) {
          window.clearInterval(poll);
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
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
          if (cancelled) return;
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
        if (cancelled) return;
        watch(runId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [productId, platform, existingRunId, requestKey]);

  const results = run?.results ?? [];
  const strong = results.filter((r) => r.score >= WEAK_BELOW);
  const weak = results.filter((r) => r.score < WEAK_BELOW);
  const done = run?.state === "succeeded";

  // Whether anything is actually working right now. A reopened run that has
  // already finished is not, and showing it the progress card made a saved
  // result look exactly like a search starting from scratch.
  const live = !run || run.state === "queued" || run.state === "running";

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
        <Button
          component={RouterLink}
          // Empty when a run was reopened by id, so fall back to what the
          // run itself says it searched for.
          to={`/products/${backTo}/plan`}
          startIcon={<ArrowBackIcon />}
          size="small"
          sx={{ mb: 1 }}
        >
          Back to the plan
        </Button>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "flex-end" }}
          gap={2}
        >
          <Box>
            <Typography variant="h4" sx={{ fontSize: 30 }}>
              Opportunities on {shown === "github" ? "GitHub" : shown}
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
              This takes 30 to 90 seconds. GitHub is slow, and every result is
              read twice — once for meaning, once for intent.
            </Typography>
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
            <OpportunityCard key={o.id} opportunity={o} />
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
                    <OpportunityCard key={o.id} opportunity={o} />
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

function OpportunityCard({ opportunity: o }: { opportunity: Opportunity }) {
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
