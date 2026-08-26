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
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

import { productApi, type Opportunity, type OpportunityRun } from "@/lib/productApi";
import { MONO } from "@/styles/theme";

const POLL_MS = 2000;

/** Anything below this is shown collapsed rather than padding the list. */
/** Matches `score.MEDIUM` on the backend. Below this is the collapsed pile. */
const WEAK_BELOW = 20;

const BAND_COLOR = {
  "very-high": "error",
  high: "warning",
  medium: "info",
  weak: "default",
} as const;

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

  const [run, setRun] = useState<OpportunityRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Start once. React runs effects twice in development, and starting a
  // second search would double the cost for no reason.
  useEffect(() => {
    if (started.current || !productId) return;
    started.current = true;

    (async () => {
      try {
        const runId = await productApi.findOpportunities(
          productId,
          platform,
          terms,
          repos,
        );
        const poll = window.setInterval(async () => {
          try {
            const next = await productApi.opportunityRun(runId);
            setRun(next);
            if (next.state === "succeeded" || next.state === "failed") {
              window.clearInterval(poll);
            }
          } catch (e) {
            window.clearInterval(poll);
            setError(e instanceof Error ? e.message : String(e));
          }
        }, POLL_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [productId, platform]);

  const results = run?.results ?? [];
  const strong = results.filter((r) => r.score >= WEAK_BELOW);
  const weak = results.filter((r) => r.score < WEAK_BELOW);
  const done = run?.state === "succeeded";

  return (
    <Stack gap={3} sx={{ maxWidth: 900, mx: "auto", width: "100%" }}>
      <Box>
        <Button
          component={RouterLink}
          to={`/products/${productId}/plan`}
          startIcon={<ArrowBackIcon />}
          size="small"
          sx={{ mb: 1 }}
        >
          Back to the plan
        </Button>
        <Typography variant="h4" sx={{ fontSize: 30 }}>
          Opportunities on {platform === "github" ? "GitHub" : platform}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          People publicly describing the problem your product solves.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {run?.error && <Alert severity="error">{run.error}</Alert>}

      {!done && !error && (
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
