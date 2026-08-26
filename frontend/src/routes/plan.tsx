import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RefreshIcon from "@mui/icons-material/Refresh";

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
          setError(
            "The plan is taking longer than expected. Try writing it again.",
          );
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
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const plan = result?.plan;
  // What the AI decided this product's world is, which is a far better
  // repository search than the product's own name.
  const topic = product?.profile?.domain || product?.name || "";

  return (
    <Stack gap={3} sx={{ maxWidth: 1100, mx: "auto", width: "100%" }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Marketing plan
          </Typography>
          <Typography variant="h4" sx={{ fontSize: 30 }}>
            {product?.name ?? "Product"}
          </Typography>
          {product?.goal && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Goal: {product.goal}
            </Typography>
          )}
        </Box>

        {plan && (
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => write(true)}
            disabled={writing}
          >
            Rewrite
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {result?.stale && !writing && (
        <Alert
          severity="info"
          action={
            <Button size="small" onClick={() => write(true)}>
              Rewrite
            </Button>
          }
        >
          This product has changed since the plan was written.
        </Alert>
      )}

      {writing && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1.5 }}>
              <AutoAwesomeIcon color="primary" />
              <Typography variant="h6" sx={{ fontSize: 17 }}>
                Writing the plan
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Reading what your website says, working out who to reach and
              where. This takes about half a minute.
            </Typography>
            <LinearProgress />
          </CardContent>
        </Card>
      )}

      {!plan && !writing && (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              No plan yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {product?.state === "ready"
                ? "The website has been read. Write the marketing plan from it."
                : "The website needs to be read first — a plan written without it is generic advice."}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => write(false)}
              disabled={product?.state === "crawling" || product?.state === "queued"}
            >
              Write the plan
            </Button>
          </CardContent>
        </Card>
      )}

      {plan && (
        <>
          <Card variant="outlined">
            <CardContent>
              <Stack gap={2.5}>
                <Section title="Strategy" body={plan.strategy} />
                <Divider />
                <Section title="Who to reach" body={plan.audience} />
                <Divider />
                <Section title="How to describe it" body={plan.positioning} />
              </Stack>
            </CardContent>
          </Card>

          <PlatformGroup
            topic={topic}
            title="Search these now"
            hint="We can find real posts here. Press the button to see who is asking."
            platforms={plan.platforms.filter((p) => p.availableNow)}
            onFind={findOpportunities}
          />

          <PlatformGroup
            title="Coming soon"
            hint="We will be able to search these once the connector is built."
            platforms={plan.platforms.filter((p) => p.searchable && !p.availableNow)}
          />

          <PlatformGroup
            title="Do these by hand"
            hint="We cannot search these. The plan tells you what to do there."
            platforms={plan.platforms.filter((p) => !p.searchable)}
          />

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            }}
          >
            <ListCard title="What to write about" items={plan.contentIdeas} />
            <ListCard title="First week" items={plan.firstWeek} numbered />
          </Box>
        </>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ */

function Section({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="body1">{body}</Typography>
    </Box>
  );
}

function PlatformGroup({
  title,
  hint,
  platforms,
  onFind,
  topic,
}: {
  title: string;
  hint: string;
  topic?: string;
  platforms: PlanPlatform[];
  onFind?: (p: PlanPlatform, terms: string[], repos: string[]) => void;
}) {
  if (platforms.length === 0) return null;

  return (
    <Box>
      <Typography variant="h6" sx={{ fontSize: 18 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {hint}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" },
        }}
      >
        {platforms.map((p) => (
          <PlatformCard
            key={p.key || p.name}
            platform={p}
            topic={topic}
            onFindOpportunities={onFind}
          />
        ))}
      </Box>
    </Box>
  );
}

function ListCard({
  title,
  items,
  numbered = false,
}: {
  title: string;
  items: string[];
  numbered?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" sx={{ fontSize: 17, mb: 1.5 }}>
          {title}
        </Typography>
        <Stack gap={1.25}>
          {items.map((item, i) => (
            <Stack key={item} direction="row" gap={1.5} alignItems="baseline">
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ minWidth: 16, flexShrink: 0 }}
              >
                {numbered ? i + 1 : "•"}
              </Typography>
              <Typography variant="body2">{item}</Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
