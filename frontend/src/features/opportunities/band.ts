import type { Opportunity } from "@/lib/productApi";

/**
 * How strong a lead looks, as a colour.
 *
 * Shared rather than declared next to each screen that shows a score: the
 * home page and the results page showing the same number in two different
 * colours would be worse than either choice on its own.
 */
export const BAND_COLOR: Record<Opportunity["band"], "error" | "warning" | "info" | "default"> = {
  "very-high": "error",
  high: "warning",
  medium: "info",
  weak: "default",
};

/** Matches `score.MEDIUM` on the backend. Below this is the collapsed pile. */
export const WEAK_BELOW = 20;
