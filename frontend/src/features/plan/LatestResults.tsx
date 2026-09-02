/* ------------------------------------------------------------------ *
 * The last GitHub search, summarised, next to the plan that produced it.
 *
 * The plan and its results used to be two screens with nothing joining
 * them, which made a genuine question hard to answer: did editing the plan
 * change what came back? You had to remember the old numbers.
 *
 * So this is a summary, not the results screen. Three leads and a count,
 * enough to see whether the last change helped; the full list stays on its
 * own page, because twenty cards under a plan is a page nobody scrolls.
 *
 * The search button here is independent of the plan's Rewrite button on
 * purpose. Re-planning and re-searching answer different questions - "are
 * we looking for the right thing" and "has anything new been posted" - and
 * tying them together means you cannot ask the second without paying for
 * the first.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";

import { BAND_COLOR } from "@/features/opportunities/band";
import { productApi, type OpportunityRun } from "@/lib/productApi";

/** Enough to tell whether the last change helped. The rest is a click away. */
const PREVIEW = 3;

interface Props {
  productId: string;
  /** Start a fresh search. The plan screen owns how that navigates. */
  onSearch: () => void;
}

export default function LatestResults({ productId, onSearch }: Props) {
  const navigate = useNavigate();
  const [run, setRun] = useState<OpportunityRun | null>(null);
  /** The last search that produced something, when the newest one failed. */
  const [fallback, setFallback] = useState<OpportunityRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* A failed run must not bury a good one.
   *
   * "Latest" means most recent, and most recent is sometimes a failure -
   * one bad click, and a card that had ten leads in it shows a red box and
   * nothing else. The results were never lost; they just stopped being the
   * newest thing. Falling back to the last search that actually produced
   * something keeps the failure visible without throwing the work away. */
  const load = useCallback(async () => {
    try {
      const newest = await productApi.lastSearch(productId);
      setRun(newest);

      if (newest && newest.state === "failed") {
        const history = await productApi.searchHistory(productId);
        const good = history.find((h) => h.state === "succeeded" && h.result_count > 0);
        if (good) setFallback(await productApi.opportunityRun(good.id));
      } else {
        setFallback(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LinearProgress />;

  // Show whichever run actually has results in it.
  const shown = fallback ?? run;
  const results = shown?.results ?? [];
  const top = [...results].sort((a, b) => b.score - a.score).slice(0, PREVIEW);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        gap={1}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Latest search
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {describe(run)}
          </Typography>
        </Box>

        <Stack direction="row" gap={1}>
          {/* `shown`, not `run` - after a failure these are different runs,
              and linking to the failed one would open an empty screen. */}
          {results.length > 0 && shown && (
            <Button size="small" onClick={() => navigate(`/opportunities?run=${shown.id}`)}>
              See all {results.length}
            </Button>
          )}
          <Button size="small" variant="contained" startIcon={<SearchIcon />} onClick={onSearch}>
            {run ? "Search again" : "Search now"}
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {/* A failed run is worth showing rather than hiding: it is usually a
          plan with no terms, and the fix is on this very page. */}
      {run?.state === "failed" && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {run.error || "That search failed."}
          {fallback && (
            <Box component="span" sx={{ display: "block", mt: 0.5, opacity: 0.85 }}>
              Showing the {fallback.results.length} results from your last
              successful search instead — nothing was lost.
            </Box>
          )}
        </Alert>
      )}

      {top.length > 0 ? (
        <Stack gap={1}>
          {top.map((o) => (
            <Stack
              key={o.id}
              direction="row"
              gap={1.5}
              alignItems="baseline"
              sx={{ py: 0.75, borderBottom: 1, borderColor: "divider", "&:last-of-type": { border: 0 } }}
            >
              <Typography
                sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, minWidth: 28 }}
                color={o.score >= 45 ? "error.main" : "text.secondary"}
              >
                {o.score}
              </Typography>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Link
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                >
                  <Typography variant="body2" noWrap>
                    {o.title}
                  </Typography>
                  <OpenInNewIcon sx={{ fontSize: 13, flexShrink: 0 }} />
                </Link>
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {o.container}
                </Typography>
              </Box>
              <Chip size="small" label={o.band} color={BAND_COLOR[o.band]} variant="outlined" />
            </Stack>
          ))}
        </Stack>
      ) : (
        run?.state !== "failed" && (
          <Typography variant="body2" color="text.secondary">
            {run
              ? "Nothing scored well enough last time. Editing the brief above changes what this looks for."
              : "No search yet. The plan below decides what this will look for."}
          </Typography>
        )
      )}
    </Paper>
  );
}

function describe(run: OpportunityRun | null): string {
  if (!run) return "This product has never been searched.";
  if (run.state === "running" || run.state === "queued") return "Running now…";

  const when = run.started_at
    ? new Date(run.started_at).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "recently";

  if (run.state === "failed") return `Failed on ${when}`;
  return `${run.results.length} found on ${when}`;
}
