import type { ReactNode } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/* Loading, empty and failed. A blank page is never acceptable. */

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
      <CircularProgress size={26} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 4, borderColor: "error.main" }}>
      <Typography variant="subtitle2" color="error" sx={{ mb: 1 }}>
        That did not work
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: onRetry ? 3 : 0 }}>
        {message} Nothing was spent.
      </Typography>
      {onRetry && (
        <Button variant="outlined" size="small" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Paper>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      alignItems={{ sm: "flex-end" }}
      sx={{ mb: 3 }}
    >
      <Box sx={{ flex: 1 }}>
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: "0.16em" }}>
          {eyebrow}
        </Typography>
        <Typography variant="h5">{title}</Typography>
        {children && (
          <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: "62ch", mt: 1 }}>
            {children}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
