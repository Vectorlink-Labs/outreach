import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EventNoteIcon from "@mui/icons-material/EventNoteOutlined";
import FlagIcon from "@mui/icons-material/OutlinedFlag";
import LightbulbIcon from "@mui/icons-material/LightbulbOutlined";
import PeopleIcon from "@mui/icons-material/PeopleAltOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import RouteIcon from "@mui/icons-material/RouteOutlined";
import CampaignIcon from "@mui/icons-material/CampaignOutlined";

import { ErrorBlock, Loading } from "@/components/StateBlocks";
import PlatformCard from "@/features/plan/PlatformCard";
import {
  productApi,
  type PlanPlatform,
  type PlanResult,
  type Product,
} from "@/lib/productApi";

/** How long to keep polling before assuming something went wrong. */
const POLL_MS = 3000;
const GIVE_UP_AFTER = 30;

/** The page never runs wider than this, so no line of prose gets unreadable. */
const PAGE = 1180;

export default function PlanRoute() {
  const { productId = "" } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const attempts = useRef(0);

  const load = useCallback(async () => {
    const [p, plan] = await Promise.all([
      productApi.get(productId),
      productApi.plan(productId),
    ]);
    setProduct(p);
    setResult(plan);
    return plan;
  }, [productId]);

  // First load.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const plan = await load();
        if (!alive) return;
        // The plan writes itself after a crawl. Arriving here before it has
        // finished is normal, so wait rather than showing an empty page.
        if (!plan) setWriting(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  // Poll while it is being written.
  useEffect(() => {
    if (!writing) return;

    const timer = window.setInterval(async () => {
      attempts.current += 1;
      try {
        const plan = await load();
        if (plan) {
          setWriting(false);
          attempts.current = 0;
        } else if (attempts.current >= GIVE_UP_AFTER) {
          setWriting(false);
          setError("The plan is taking longer than expected. Try writing it again.");
        }
      } catch (e) {
        setWriting(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [writing, load]);

  const write = async (force: boolean) => {
    setError(null);
    try {
      await productApi.makePlan(productId, force);
      attempts.current = 0;
      setWriting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const findOpportunities = (
    platform: PlanPlatform,
    terms: string[],
    repos: string[],
  ) => {
    // Whatever is on the card right now, which may be what the agent chose
    // or what the user corrected. The search screen never has to ask again.
    const params = new URLSearchParams({
      product: productId,
      platform: platform.key,
      terms: terms.join("|"),
      repos: repos.join("|"),
    });
    navigate(`/opportunities?${params.toString()}`);
  };

  if (loading) {
    return (
      <Shell>
        <Loading label="Opening the plan" />
      </Shell>
    );
  }

  const plan = result?.plan;
  // What the AI decided this product's world is, which is a far better
  // repository search than the product's own name.
  const topic = product?.profile?.domain || product?.name || "";

  const ready = plan?.platforms.filter((p) => p.availableNow) ?? [];
  const soon = plan?.platforms.filter((p) => p.searchable && !p.availableNow) ?? [];
  const byHand = plan?.platforms.filter((p) => !p.searchable) ?? [];

  return (
    <Shell>
      {/* ------------------------------------------------------- header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "flex-end" }}
        justifyContent="space-between"
        gap={2}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", letterSpacing: ".16em", fontSize: 10.5 }}
          >
            Marketing plan
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 680, letterSpacing: "-.022em" }}
          >
            {product?.name ?? "Product"}
          </Typography>

          {product && (
            <Stack
              direction="row"
              alignItems="center"
              flexWrap="wrap"
              gap={1}
              sx={{ mt: 1, color: "text.secondary" }}
              divider={<Dot />}
            >
              <Meta>{product.domain}</Meta>
              <Meta>
                {product.pageCount} {product.pageCount === 1 ? "page" : "pages"} read
              </Meta>
              {plan && (
                <Meta>
                  {plan.platforms.length} {plan.platforms.length === 1 ? "channel" : "channels"}
                </Meta>
              )}
              {result?.madeAt && <Meta>written {shortDate(result.madeAt)}</Meta>}
            </Stack>
          )}
        </Box>

        {plan && (
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => write(true)}
            disabled={writing}
            sx={{ flexShrink: 0 }}
          >
            Rewrite
          </Button>
        )}
      </Stack>

      {error && <ErrorBlock message={error} onRetry={() => window.location.reload()} />}

      {result?.stale && !writing && (
        <Alert
          severity="info"
          variant="outlined"
          action={
            <Button size="small" onClick={() => write(true)}>
              Rewrite
            </Button>
          }
        >
          This product has changed since the plan was written.
        </Alert>
      )}

      {/* ------------------------------------------------------- writing */}
      {writing && (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <LinearProgress />
          <Box sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 1 }}>
              <AutoAwesomeIcon color="primary" sx={{ fontSize: 20 }} />
              <Typography sx={{ fontWeight: 650, fontSize: 17 }}>Writing the plan</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "62ch" }}>
              Reading what your website says, working out who to reach and where. This
              takes about half a minute.
            </Typography>
          </Box>
        </Paper>
      )}

      {/* --------------------------------------------------------- empty */}
      {!plan && !writing && (
        <Paper variant="outlined" sx={{ px: 3, py: 7, textAlign: "center" }}>
          <AutoAwesomeIcon sx={{ fontSize: 28, color: "text.disabled", mb: 1.5 }} />
          <Typography sx={{ fontWeight: 650, fontSize: 18, mb: 1 }}>No plan yet</Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: "48ch", mx: "auto" }}
          >
            {product?.state === "ready"
              ? "The website has been read. Write the marketing plan from it."
              : "The website needs to be read first — a plan written without it is generic advice."}
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => write(false)}
            disabled={product?.state === "crawling" || product?.state === "queued"}
          >
            Write the plan
          </Button>
        </Paper>
      )}

      {/* ---------------------------------------------------------- plan */}
      {plan && (
        <>
          {/* Three columns, not three stacked paragraphs. At full width a
              paragraph here ran to about 130 characters a line, which is
              roughly twice a readable measure. */}
          <Paper
            variant="outlined"
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
              "& > * + *": {
                borderTop: { xs: 1, md: 0 },
                borderLeft: { xs: 0, md: 1 },
                borderColor: "divider",
              },
            }}
          >
            <Pillar icon={<RouteIcon />} title="Strategy" body={plan.strategy} />
            <Pillar icon={<PeopleIcon />} title="Who to reach" body={plan.audience} />
            <Pillar icon={<CampaignIcon />} title="How to describe it" body={plan.positioning} />
          </Paper>

          {product?.goal && (
            <Stack
              direction="row"
              gap={1.5}
              sx={{
                px: 2,
                py: 1.5,
                borderRadius: 2,
                borderLeft: 3,
                borderColor: "primary.main",
                bgcolor: "action.hover",
              }}
            >
              <FlagIcon sx={{ fontSize: 18, color: "primary.main", mt: 0.25, flexShrink: 0 }} />
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    display: "block",
                    fontSize: 10,
                    letterSpacing: ".1em",
                    color: "text.secondary",
                    lineHeight: 1.6,
                  }}
                >
                  Your goal
                </Typography>
                <Typography variant="body2">{product.goal}</Typography>
              </Box>
            </Stack>
          )}

          {/* One card, full width, laid out in two columns internally. The
              old three-column grid left two thirds of the row empty next to
              the single card that actually does anything. */}
          <Group
            title="Search these now"
            hint="We can find real posts here. Press the button to see who is asking."
            count={ready.length}
            tone="live"
            platforms={ready}
            columns={1}
            topic={topic}
            onFind={findOpportunities}
          />

          <Group
            title="Do these by hand"
            hint="We cannot search these. The plan says what to do there and in what voice."
            count={byHand.length}
            platforms={byHand}
            columns={2}
          />

          <Group
            title="Coming soon"
            hint="We will be able to search these once the connector is built."
            count={soon.length}
            platforms={soon}
            columns={2}
          />

          <Box
            sx={{
              display: "grid",
              gap: 2.5,
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
            }}
          >
            <ListCard
              icon={<LightbulbIcon />}
              title="What to write about"
              items={plan.contentIdeas}
            />
            <ListCard
              icon={<EventNoteIcon />}
              title="First week"
              items={plan.firstWeek}
              numbered
            />
          </Box>
        </>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The page frame.
 *
 * AppShell renders its children bare, so every route brings its own
 * padding. This one had none, which is why the title sat welded to the
 * toolbar and the content touched the window edge on a narrow screen.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ maxWidth: PAGE, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 3, md: 5 } }}>
      <Stack gap={{ xs: 2.5, md: 3.5 }}>{children}</Stack>
    </Box>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      {children}
    </Typography>
  );
}

function Dot() {
  return (
    <Box
      sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "text.disabled", flexShrink: 0 }}
    />
  );
}

/** Written 26 Aug. Not "3 days ago", which needs a tick to stay true. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Box sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.25 }}>
        <Box sx={{ color: "text.secondary", display: "flex", "& svg": { fontSize: 17 } }}>
          {icon}
        </Box>
        <Typography
          variant="overline"
          sx={{ fontSize: 10.5, letterSpacing: ".12em", color: "text.secondary", lineHeight: 1.6 }}
        >
          {title}
        </Typography>
      </Stack>
      <Typography variant="body2" sx={{ lineHeight: 1.65 }}>
        {body || <Box component="span" sx={{ color: "text.disabled" }}>—</Box>}
      </Typography>
    </Box>
  );
}

function Group({
  title,
  hint,
  count,
  tone,
  platforms,
  columns,
  topic,
  onFind,
}: {
  title: string;
  hint: string;
  count: number;
  tone?: "live";
  platforms: PlanPlatform[];
  /** How many the row holds at desktop width. One means the card goes wide. */
  columns: 1 | 2 | 3;
  topic?: string;
  onFind?: (p: PlanPlatform, terms: string[], repos: string[]) => void;
}) {
  if (platforms.length === 0) return null;

  // Never more columns than cards, which is what left the void in the old
  // layout: three columns, one card, two thirds of nothing.
  const cols = Math.min(columns, platforms.length);
  const wide = cols === 1;

  return (
    <Box component="section">
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 0.5 }}>
        <Typography sx={{ fontWeight: 680, fontSize: 19, letterSpacing: "-.015em" }}>
          {title}
        </Typography>
        <Chip
          size="small"
          label={count}
          color={tone === "live" ? "success" : "default"}
          variant="outlined"
          sx={{ height: 20, fontSize: 11, minWidth: 26 }}
        />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: "72ch" }}>
        {hint}
      </Typography>

      <Box
        sx={{
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", md: `repeat(${cols}, minmax(0, 1fr))` },
        }}
      >
        {platforms.map((p) => (
          <PlatformCard
            key={p.key || p.name}
            platform={p}
            topic={topic}
            wide={wide}
            onFindOpportunities={onFind}
          />
        ))}
      </Box>
    </Box>
  );
}

function ListCard({
  icon,
  title,
  items,
  numbered = false,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  numbered?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ px: 2.5, py: 2 }}>
        <Box sx={{ color: "text.secondary", display: "flex", "& svg": { fontSize: 18 } }}>
          {icon}
        </Box>
        <Typography sx={{ fontWeight: 650, fontSize: 16 }}>{title}</Typography>
      </Stack>
      <Divider />

      <Stack sx={{ p: 2.5 }} gap={1.5}>
        {items.map((item, i) => (
          // Index in the key because the model does occasionally repeat a
          // line, and two identical keys drop one of them silently.
          <Stack key={`${i}-${item}`} direction="row" gap={1.5} alignItems="flex-start">
            {numbered ? (
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  mt: 0.15,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                }}
              >
                {i + 1}
              </Box>
            ) : (
              <Box
                sx={{
                  width: 5,
                  height: 5,
                  mt: 0.9,
                  flexShrink: 0,
                  borderRadius: "50%",
                  bgcolor: "text.disabled",
                }}
              />
            )}
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {item}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
