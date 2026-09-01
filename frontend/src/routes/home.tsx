import { useEffect, useState, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import HistoryIcon from "@mui/icons-material/History";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";

import { ErrorBlock, Loading } from "@/components/StateBlocks";
import { BAND_COLOR } from "@/features/opportunities/band";
import { useAuth } from "@/lib/auth";
import {
  productApi,
  type Opportunity,
  type OpportunityRun,
  type SearchSummary,
} from "@/lib/productApi";
import { useSelectedProduct } from "@/lib/selectedProduct";
import { MONO } from "@/styles/theme";

/** How many leads the card shows before sending you to the full list. */
const PREVIEW = 5;

/** A live run is still moving, so keep asking. */
const POLL_MS = 4000;

/**
 * Where signing in lands you.
 *
 * The last search comes first, because that is the thing somebody comes
 * back to look at. Which product you are on is chosen in the top bar now,
 * so this screen is the workspace for whatever is selected rather than a
 * picker with a placeholder underneath it.
 */
export default function HomeRoute() {
  const { user } = useAuth();
  const { products, selected, loading, error } = useSelectedProduct();

  const [run, setRun] = useState<OpportunityRun | null>(null);
  const [history, setHistory] = useState<SearchSummary[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const productId = selected?.id ?? "";

  useEffect(() => {
    if (!productId) {
      setRun(null);
      setHistory([]);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const fetchOnce = async () => {
      try {
        // Together, because the history is what tells you whether the last
        // search is the only one or the newest of ten.
        const [found, past] = await Promise.all([
          productApi.lastSearch(productId),
          productApi.searchHistory(productId),
        ]);
        if (cancelled) return;
        setRun(found);
        setHistory(past);
        setRunError(null);
        // Keep watching only while something is actually happening.
        if (found && (found.state === "queued" || found.state === "running")) {
          timer = window.setTimeout(() => void fetchOnce(), POLL_MS);
        }
      } catch (e) {
        if (!cancelled) setRunError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingRun(false);
      }
    };

    setLoadingRun(true);
    setRun(null);
    setHistory([]);
    void fetchOnce();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productId]);

  if (error) {
    return (
      <Page>
        <ErrorBlock message={error} onRetry={() => window.location.reload()} />
      </Page>
    );
  }

  if (loading) {
    return (
      <Page>
        <Loading label="Loading your products" />
      </Page>
    );
  }

  /* ------------------------------------------------------ no products */
  if (products.length === 0) {
    return (
      <Page>
        <Greeting name={user?.name} />
        <Paper variant="outlined" sx={{ px: 3, py: 7, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 650, fontSize: 18, mb: 1 }}>
            No products yet
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: "44ch", mx: "auto", mb: 3 }}
          >
            Add your first one and we will read its website to learn what it does.
          </Typography>
          <Button component={RouterLink} to="/new" variant="contained" startIcon={<AddIcon />}>
            Add a product
          </Button>
        </Paper>
      </Page>
    );
  }

  const running = run?.state === "queued" || run?.state === "running";
  const results = run?.results ?? [];
  const top = results.slice(0, PREVIEW);

  return (
    <Page>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "flex-end" }}
        gap={2}
      >
        <Greeting name={user?.name} product={selected?.name} />

        <Stack direction="row" gap={1.5} sx={{ flexShrink: 0 }}>
          <Button
            component={RouterLink}
            to={`/products/${productId}/plan`}
            variant="outlined"
            startIcon={<AutoAwesomeIcon />}
          >
            Marketing plan
          </Button>
          <Button
            component={RouterLink}
            to={`/opportunities?product=${productId}&platform=${run?.platform ?? "github"}`}
            variant="contained"
            startIcon={<SearchIcon />}
            disabled={running}
          >
            {run ? "Search again" : "Search now"}
          </Button>
        </Stack>
      </Stack>

      {runError && <ErrorBlock message={runError} />}

      {/* ---------------------------------------------------- last search */}
      {loadingRun && <Loading label="Looking for your last search" />}

      {!loadingRun && !run && !runError && (
        <Paper variant="outlined" sx={{ px: 3, py: 6, textAlign: "center" }}>
          <SearchIcon sx={{ fontSize: 26, color: "text.disabled", mb: 1.5 }} />
          <Typography sx={{ fontWeight: 650, fontSize: 17, mb: 1 }}>
            No searches yet
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: "50ch", mx: "auto" }}
          >
            {selected?.state === "ready"
              ? "Open the marketing plan and press Find opportunities, or search straight away with the plan's own terms."
              : "The website has not been read yet, so a search would have nothing to match against."}
          </Typography>
        </Paper>
      )}

      {run && (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          {running && <LinearProgress variant="determinate" value={run.percent} />}

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={2}
            sx={{ px: 2.5, py: 2, flexWrap: "wrap" }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="overline"
                sx={{
                  display: "block",
                  fontSize: 10,
                  letterSpacing: ".12em",
                  color: "text.secondary",
                  lineHeight: 1.6,
                }}
              >
                Last search
              </Typography>
              <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
                <Typography sx={{ fontWeight: 680, fontSize: 20 }}>
                  {running
                    ? "Searching…"
                    : run.state === "failed"
                      ? "Search failed"
                      : `${results.length} ${results.length === 1 ? "opportunity" : "opportunities"}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  on {run.platform === "github" ? "GitHub" : run.platform}
                  {run.started_at && ` · ${when(run.started_at)}`}
                </Typography>
              </Stack>
            </Box>

            <Button
              component={RouterLink}
              to={`/opportunities?run=${run.id}`}
              endIcon={<ArrowForwardIcon />}
              sx={{ flexShrink: 0 }}
            >
              {running ? "Watch it run" : "See all results"}
            </Button>
          </Stack>

          {run.error && (
            <Box sx={{ px: 2.5, pb: 2 }}>
              <Typography variant="body2" color="error">
                {run.error}
              </Typography>
            </Box>
          )}

          {top.length > 0 && (
            <>
              <Divider />
              <Stack divider={<Divider />}>
                {top.map((item) => (
                  <ResultRow key={item.id} item={item} />
                ))}
              </Stack>
            </>
          )}

          {results.length > PREVIEW && (
            <>
              <Divider />
              <Box sx={{ px: 2.5, py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  and {results.length - PREVIEW} more
                </Typography>
              </Box>
            </>
          )}

          {!running && run.state === "succeeded" && results.length === 0 && (
            <>
              <Divider />
              <Box sx={{ px: 2.5, py: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Nothing came back. That usually means the plan searched too
                  narrowly rather than that nobody has the problem — open the
                  results to read what each query returned.
                </Typography>
              </Box>
            </>
          )}
        </Paper>
      )}

      {/* ------------------------------------------------------- history */}
      {/* Everything before the newest one. Opening any of them reads the
          stored result and never starts another search. */}
      {history.length > 1 && (
        <Box component="section">
          <Typography sx={{ fontWeight: 680, fontSize: 17, mb: 0.5 }}>
            Earlier searches
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Saved results. Opening one costs nothing.
          </Typography>

          <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Stack divider={<Divider />}>
              {history.slice(1).map((entry) => (
                <Stack
                  key={entry.id}
                  component={RouterLink}
                  to={`/opportunities?run=${entry.id}`}
                  direction="row"
                  alignItems="center"
                  gap={2}
                  sx={{
                    px: 2.5,
                    py: 1.75,
                    textDecoration: "none",
                    color: "inherit",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <HistoryIcon sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0 }} />

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                      {entry.state === "succeeded"
                        ? `${entry.result_count} ${entry.result_count === 1 ? "opportunity" : "opportunities"}`
                        : entry.state === "failed"
                          ? "Search failed"
                          : "Still running"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.platform === "github" ? "GitHub" : entry.platform} ·{" "}
                      {when(entry.started_at)}
                    </Typography>
                  </Box>

                  {entry.top_score > 0 && (
                    <Chip
                      size="small"
                      label={`best ${entry.top_score}`}
                      variant="outlined"
                      sx={{ fontFamily: MONO, height: 22, fontSize: 11, flexShrink: 0 }}
                    />
                  )}
                  <ArrowForwardIcon sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }} />
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Box>
      )}

      {/* --------------------------------------------------- quick links */}
      {selected && (
        <Stack direction="row" gap={1.5} flexWrap="wrap">
          <Button
            component="a"
            href={productApi.markdownUrl(productId)}
            target="_blank"
            rel="noopener"
            size="small"
            color="inherit"
            startIcon={<DescriptionIcon />}
            disabled={selected.state !== "ready"}
          >
            What we read from the website
          </Button>
          <Button
            component={RouterLink}
            to="/settings/product"
            size="small"
            color="inherit"
          >
            Manage products
          </Button>
        </Stack>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function Page({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 3, md: 5 } }}>
      <Stack gap={3}>{children}</Stack>
    </Box>
  );
}

function Greeting({ name, product }: { name?: string; product?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", letterSpacing: ".16em", fontSize: 10.5 }}
      >
        Signed in
      </Typography>
      <Typography
        variant="h4"
        sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 680, letterSpacing: "-.022em" }}
      >
        Hello, {name ?? ""}
      </Typography>
      {product && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Working on <b>{product}</b>. Switch in the bar above.
        </Typography>
      )}
    </Box>
  );
}

function ResultRow({ item }: { item: Opportunity }) {
  return (
    <Stack
      direction="row"
      alignItems="flex-start"
      gap={1.75}
      sx={{ px: 2.5, py: 1.75, "&:hover": { bgcolor: "action.hover" } }}
    >
      <Chip
        size="small"
        label={item.score}
        color={BAND_COLOR[item.band]}
        variant="outlined"
        sx={{ fontFamily: MONO, height: 24, minWidth: 40, flexShrink: 0, mt: 0.25 }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Link
          href={item.url}
          target="_blank"
          rel="noopener"
          underline="hover"
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: "text.primary",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
          }}
        >
          {item.title}
          <OpenInNewIcon sx={{ fontSize: 13, color: "text.disabled" }} />
        </Link>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 0.25 }}
        >
          <Box component="span" sx={{ fontFamily: MONO }}>
            {item.container ?? "unknown"}
          </Box>
          {item.problem && ` · ${item.problem}`}
        </Typography>
      </Box>
    </Stack>
  );
}

/** "31 Aug". Not "2 days ago", which needs a tick to stay honest. */
function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
