import { createFileRoute, redirect } from "@tanstack/react-router";

// /catalog → /shop (301). The old internal/staff catalog (getPublicCatalog over
// raw inventory_items, NO is_website_ready gate) is superseded by /shop, the
// canonical public storefront catalog over the gated v_public_inventory view.
// /catalog was a standalone public route (only linked from the PDP not-found,
// now repointed to /shop) — not part of the internal _app nav — so redirecting
// is safe. statusCode 301 makes it a permanent move for crawlers.
export const Route = createFileRoute("/catalog")({
  beforeLoad: () => {
    throw redirect({ to: "/shop", statusCode: 301 });
  },
});
