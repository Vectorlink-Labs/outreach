/* ------------------------------------------------------------------ *
 * What the product does and what the owner wants — editable in place.
 *
 * These two fields are the whole input to the planner: they decide the
 * search terms, the repositories, and what every result is judged against.
 * They were write-once until now, set on the create form and never
 * reachable again, so getting them wrong meant making a second product and
 * re-crawling the same website. That is how an account ends up with three
 * rows called "coalent", two of which nobody can tell apart.
 *
 * Saving does NOT rewrite the plan. Editing and re-planning are two
 * decisions: a typo correction should not silently spend a model call and
 * replace a plan somebody has hand-edited. Instead the plan goes stale on
 * its own — both fields are hashed into it — and this says so, with the
 * button that acts on it right there.
 * ------------------------------------------------------------------ */

import { useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import EditIcon from "@mui/icons-material/Edit";
import FlagIcon from "@mui/icons-material/Flag";
import InventoryIcon from "@mui/icons-material/Inventory2";

import { productApi, type Product } from "@/lib/productApi";

/** Matches the server's own limits, so a save cannot fail on length. */
const MAX_DESCRIPTION = 4000;
const MAX_GOAL = 2000;

interface Props {
  product: Product;
  /** True when the plan no longer matches these fields. */
  stale: boolean;
  /** Re-read the product after a save. Whatever it returns is ignored. */
  onSaved: () => unknown | Promise<unknown>;
  /** Rewrite the plan. Offered here only once the text has moved on. */
  onRewrite: () => void;
}

export default function ProductBrief({ product, stale, onSaved, onRewrite }: Props) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(product.description ?? "");
  const [goal, setGoal] = useState(product.goal ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    // Re-seed from the product rather than trusting leftover state: the
    // page reloads it after every save and after every rewrite.
    setDescription(product.description ?? "");
    setGoal(product.goal ?? "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await productApi.update(product.id, {
        description: description.trim() || null,
        goal: goal.trim() || null,
      });
      await onSaved();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const changed =
    description.trim() !== (product.description ?? "").trim() ||
    goal.trim() !== (product.goal ?? "").trim();

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Your brief
        </Typography>
        {!editing && (
          <Button size="small" startIcon={<EditIcon />} onClick={open}>
            Edit
          </Button>
        )}
      </Stack>

      {editing ? (
        <Stack gap={2}>
          <TextField
            label="What does it do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            slotProps={{ htmlInput: { maxLength: MAX_DESCRIPTION } }}
            helperText="Describe the problem in the words someone with it would type. This is what finds people describing it differently."
          />
          <TextField
            label="What are you trying to achieve?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            slotProps={{ htmlInput: { maxLength: MAX_GOAL } }}
            helperText="Finding early customers and finding hires produce completely different results."
          />

          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" gap={1}>
            <Button variant="contained" onClick={save} disabled={saving || !changed}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack gap={2}>
          <Field
            icon={<InventoryIcon sx={{ fontSize: 18, color: "text.secondary" }} />}
            label="What it does"
            value={product.description}
            empty="Not set — the planner is working from the website alone."
          />
          <Field
            icon={<FlagIcon sx={{ fontSize: 18, color: "primary.main" }} />}
            label="Your goal"
            value={product.goal}
            empty="Not set — results are not aimed at anything in particular."
          />
        </Stack>
      )}

      {/* Only after an edit has actually landed. Saying "out of date" next
          to text nobody has touched reads as a fault rather than a choice. */}
      {stale && !editing && (
        <Alert
          severity="info"
          icon={<AutoFixHighIcon fontSize="inherit" />}
          sx={{ mt: 2 }}
          action={
            <Button size="small" onClick={onRewrite}>
              Rewrite
            </Button>
          }
        >
          The plan was written from an earlier version of this. Rewrite it to search for what
          it says now.
        </Alert>
      )}
    </Paper>
  );
}

function Field({
  icon,
  label,
  value,
  empty,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  empty: string;
}) {
  return (
    <Stack direction="row" gap={1.5}>
      <Box sx={{ mt: 0.25, flexShrink: 0 }}>{icon}</Box>
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
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: value ? "text.primary" : "text.disabled", fontStyle: value ? "normal" : "italic" }}
        >
          {value || empty}
        </Typography>
      </Box>
    </Stack>
  );
}
