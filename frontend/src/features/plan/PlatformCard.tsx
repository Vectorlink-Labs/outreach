import { useState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import SearchIcon from "@mui/icons-material/Search";

import EditableChips from "./EditableChips";
import RepoSuggest from "./RepoSuggest";
import type { PlanPlatform } from "@/lib/productApi";
import { MONO } from "@/styles/theme";

interface Props {
  platform: PlanPlatform;
  /** Seeds the repository search. The product's domain works well. */
  topic?: string;
  onFindOpportunities?: (
    platform: PlanPlatform,
    terms: string[],
    repos: string[],
  ) => void;
}

/** One word matches tens of thousands of issues; GitHub serves 1,000 of them. */
function warnTerm(term: string): string | null {
  const words = term.trim().split(/\s+/).length;
  if (words === 1) return "One word is too broad — you will see a random slice.";
  if (words > 3) return "Too long — matched as an exact phrase, so it will find nothing.";
  return null;
}

/**
 * One platform from the plan.
 *
 * Three states, and keeping them apart is the point of this component.
 * "We can search this now", "we will be able to" and "we never will" are
 * three different promises, and collapsing the last two leaves someone
 * waiting for posts that are not coming.
 */
export default function PlatformCard({ platform, topic, onFindOpportunities }: Props) {
  // Local, not saved back to the plan. A tweak for one run should not
  // silently rewrite the agent's plan underneath the user.
  const [terms, setTerms] = useState(platform.searchTerms);
  const [repos, setRepos] = useState(platform.targetPlaces);

  const status = platform.availableNow
    ? { label: "Search now", color: "success" as const }
    : platform.searchable
      ? { label: "Coming soon", color: "warning" as const }
      : { label: "Advice only", color: "default" as const };

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // The one you can act on should look different from the six you
        // cannot, before anybody reads a word.
        borderColor: platform.availableNow ? "success.main" : "divider",
        borderWidth: platform.availableNow ? 2 : 1,
      }}
    >
      <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography variant="h6" sx={{ fontSize: 18 }}>
            {platform.name}
          </Typography>
          <Chip size="small" label={status.label} color={status.color} variant="outlined" />
        </Stack>

        {platform.why && (
          <Typography variant="body2" color="text.secondary">
            {platform.why}
          </Typography>
        )}

        {platform.whatToDo && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              What to do
            </Typography>
            <Typography variant="body2">{platform.whatToDo}</Typography>
          </Box>
        )}

        {platform.tone && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Tone
            </Typography>
            <Typography variant="body2">{platform.tone}</Typography>
          </Box>
        )}

        {platform.availableNow ? (
          <>
            <Divider />
            <EditableChips
              label="Repositories to sweep"
              hint="Every recent issue becomes a candidate, no keyword needed. This is your best source."
              values={repos}
              placeholder="owner/name"
              onChange={setRepos}
            />
            <RepoSuggest
              topic={topic || platform.name}
              current={repos}
              onAdd={(name) =>
                setRepos((prev) =>
                  prev.some((r) => r.toLowerCase() === name.toLowerCase())
                    ? prev
                    : [...prev, name],
                )
              }
            />
            <EditableChips
              label="Phrases to search"
              hint="Two or three words each. One word matches tens of thousands and you only ever see the first 1,000."
              values={terms}
              placeholder="stale index"
              onChange={setTerms}
              warn={warnTerm}
            />
          </>
        ) : (
          <>
            {platform.targetPlaces.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.75 }}
                >
                  Where
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {platform.targetPlaces.map((place) => (
                    <Chip
                      key={place}
                      size="small"
                      label={place}
                      variant="outlined"
                      sx={{ fontFamily: MONO, fontSize: 11.5 }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}

        <Box sx={{ flex: 1 }} />

        {platform.availableNow && onFindOpportunities && (
          <>
            <Divider sx={{ mt: 1 }} />
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={() => onFindOpportunities(platform, terms, repos)}
              sx={{ mt: 1.5 }}
            >
              Find opportunities
            </Button>
          </>
        )}

        {platform.searchable && !platform.availableNow && (
          <>
            <Divider sx={{ mt: 1 }} />
            <Tooltip title="The connector for this platform has not been built yet.">
              <span>
                <Button variant="outlined" disabled fullWidth sx={{ mt: 1.5 }}>
                  Not connected yet
                </Button>
              </span>
            </Tooltip>
          </>
        )}
      </CardContent>
    </Card>
  );
}
