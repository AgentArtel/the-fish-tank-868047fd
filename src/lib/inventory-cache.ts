import type { QueryClient } from "@tanstack/react-query";

// Invalidate every view that reflects inventory state so the stock list, the
// sidebar workload badges, and the coral/missing-tag surfaces all refresh
// together after a mutation. Mirrors the pricing-approval refresh (the
// canonical set) so counts never lag behind an edit.
export function invalidateInventoryViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["inventory"] }); // stock list / detail / coral plug column
  qc.invalidateQueries({ queryKey: ["workload"] }); // nav badge counts
  qc.invalidateQueries({ queryKey: ["coral-discovery-overview"] });
  qc.invalidateQueries({ queryKey: ["missing-tags"] });
}
