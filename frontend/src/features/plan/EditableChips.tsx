import { useState } from "react";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";

import { MONO } from "@/styles/theme";

interface Props {
  label: string;
  hint?: string;
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
  /** Flags values that will search badly, so the reason is visible up front. */
  warn?: (value: string) => string | null;
}

/**
 * A list the user can correct before spending a run.
 *
 * The planner has never seen a result. It is a good first guess and a poor
 * last word, and making somebody rewrite an entire plan to change one search
 * term is the kind of friction that stops people tuning anything at all.
 */
export default function EditableChips({
  label,
  hint,
  values,
  placeholder,
  onChange,
  warn,
}: Props) {
  const [typed, setTyped] = useState("");

  const add = () => {
    const value = typed.trim();
    if (!value) return;
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setTyped("");
  };

  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
          {hint}
        </Typography>
      )}

      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75, mb: 1 }}>
        {values.map((value) => {
          const problem = warn?.(value) ?? null;
          return (
            <Chip
              key={value}
              size="small"
              label={value}
              onDelete={() => remove(value)}
              color={problem ? "warning" : "default"}
              variant={problem ? "filled" : "outlined"}
              title={problem ?? undefined}
              sx={{ fontFamily: MONO, fontSize: 11.5 }}
            />
          );
        })}
        {values.length === 0 && (
          <Typography variant="caption" color="text.disabled">
            none
          </Typography>
        )}
      </Stack>

      <TextField
        size="small"
        fullWidth
        value={typed}
        placeholder={placeholder}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        slotProps={{
          input: {
            sx: { fontFamily: MONO, fontSize: 12.5 },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={add} disabled={!typed.trim()}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    </Box>
  );
}
