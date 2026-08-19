import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";

import { PageHeader } from "@/components/StateBlocks";
import BriefForm from "@/features/brief-form/BriefForm";
import { api } from "@/lib/client";
import { productApi } from "@/lib/productApi";
import type { BriefInput } from "@/lib/types";

/**
 * The brief form. Five visible fields, the rest collapsed.
 *
 * Pressing Start search does two things:
 *
 *   1. saves the brief
 *   2. asks the backend to read the product website, for real, into
 *      PostgreSQL
 *
 * Then it hands over to the reading screen, which waits for the crawl.
 * Nothing is spent on a search run until the plan is approved two screens
 * later.
 */
export default function NewSearchRoute() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (input: BriefInput) => {
    setBusy(true);
    setError(null);
    try {
      const brief = await api.createBrief(input);

      // The website read is real. If the backend is down, say so and carry
      // on without it rather than losing the brief the user just wrote.
      try {
        const product = await productApi.create(input.productName, input.productUrl);
        navigate(`/products/${product.id}/reading`, { state: { briefId: brief.id } });
        return;
      } catch (err) {
        setError(
          `${err instanceof Error ? err.message : "Could not read the website."} ` +
            "Carrying on without the product document.",
        );
      }

      const plan = await api.compilePlan(brief.id);
      navigate(`/plans/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: { xs: 4, md: 7 } }}>
      <PageHeader eyebrow="New search" title="Tell us what to look for">
        Five fields. We search connected public sources, rank everything by how good an
        opportunity it is, and show the evidence behind every score.
      </PageHeader>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <BriefForm submitting={busy} onSubmit={submit} />
    </Box>
  );
}
