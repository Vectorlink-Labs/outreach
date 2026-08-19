import { useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import AppShell from "@/components/AppShell";
import BriefsRoute from "@/routes/briefs";
import NewSearchRoute from "@/routes/new-search";
import ReadingWebsiteRoute from "@/routes/reading-website";
import ResultsRoute from "@/routes/results";
import ReviewPlanRoute from "@/routes/review-plan";
import RunRoute from "@/routes/run";
import SettingsProductRoute from "@/routes/settings-product";
import { createAppTheme } from "@/styles/theme";

/**
 * Routes follow the three objects: a Brief compiles to a Plan, a Plan
 * produces Runs, a Run has Results.
 */
export default function App() {
  const [mode, setMode] = useState<"light" | "dark">(() =>
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppShell mode={mode} onToggleMode={() => setMode(mode === "light" ? "dark" : "light")}>
          <Routes>
            <Route path="/" element={<NewSearchRoute />} />
            <Route path="/briefs" element={<BriefsRoute />} />
            <Route path="/products/:productId/reading" element={<ReadingWebsiteRoute />} />
            <Route path="/plans/:planId" element={<ReviewPlanRoute />} />
            <Route path="/runs/:runId" element={<RunRoute />} />
            <Route path="/runs/:runId/results" element={<ResultsRoute />} />
            <Route path="/settings/product" element={<SettingsProductRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ThemeProvider>
  );
}
