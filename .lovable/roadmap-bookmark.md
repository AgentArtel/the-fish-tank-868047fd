# Roadmap bookmark — 2026-06-29

A clean stopping point. Captures what's DONE, what's PARKED, and the two features the owner wants to focus on
next, so any of it can be resumed cold. Nothing below is in active development.

## ✅ DONE — public storefront chapter (live / verified)
- Storefront live at `the-fish-tank.lovable.app`: home (`/`), `/shop`, `/collections/$slug`, `/products/$slug`,
  `/visit`, `/catalog`→`/shop` 301. (#103, #105, #107)
- Re-skin (blue-tang) + PWA + collapsible sidebar; auth-leak fix render-gating the `_app` shell (#109).
- **Dynamic intake → Publish → live loop, proven:** staff `/inventory/$id` "Publish to website" (invokes the
  `publish-inventory-item` edge fn) + `sourceable` tri-state; storefront **order-ahead** state
  ("Order by Sunday · pickup Wednesday", stays listed, `BackOrder`); WYSIWYG one-offs drop. Smoke-tested
  14/14, `/shop` went 2→3 with no redeploy. (#112)
- Security scan clean (restored `security_invoker = on` on the two public views; public-media bucket warn
  accepted as intentional). (#114)
- Standing gate: Lovable runs `tests/smoke/storefront_smoke.py` against the live deploy each phase.
- **Only open thread:** a final Lovable **publish** (a deploy was mid-flight). Once published, this chapter is
  fully closed.

## ⏸ PARKED — storefront phases 4 & 5 (scoped, not started)
Full plan: `.lovable/handoff-public-website.md`. Set aside intentionally so we can live with what's built first.
- **Phase 4 — Content:** blog / guides / events / FAQ pages (+ author join). Tables/views exist; needs the
  routes + an admin authoring path (or author directly in Lovable).
- **Phase 5 — SEO/launch + polish:** sitemap.xml, robots.txt, 301 redirects, real copy pass (trust-bar
  promises, hero typography scale one notch small), confirm brand fonts, real product photography.
- Also parked (future commerce): `.lovable/scope-storefront-commerce.md` — checkout/payment, the order-ahead
  *fulfillment* admin view (evolves from `/inventory/restock`), customer accounts/portal, membership perks.

## 🎯 NEXT FOCUS — two features to make legit & demo-able
After we get familiar with what's built and run more tests, dig into these two.

### 1. PO intake → "New Arrivals" Facebook post
Already researched/scoped: `.lovable/scope-cms-po-to-facebook.md` + `.lovable/plan-cms-po-to-facebook.md`.
- **~90% reuse** for the PO → line-items → CMS-draft half (vendor batch → `vendor_line_items`, the AI invoice
  parser, the content/media model all exist).
- **Two real decisions, not code:** (a) royalty-free image sourcing (scraping the open web is NOT royalty-free
  — legal/brand risk); (b) Facebook publishing depth.
- **Recommended demo path = Phase A:** generate a draft caption + a downloadable image set the owner posts by
  hand. Works day one, **zero Meta App Review**. Phase B (direct Graph API publish) needs Meta App Review +
  `pages_manage_posts` — bigger, later. Note: `settings.meta.tsx` is currently a **placeholder** (no OAuth/
  tokens) — fine for Phase A.
- **To resume, owner decides:** Phase A vs B, and the image-sourcing approach (vendor-provided images first?).

### 2. Label export / print (specific label printer)
New — nothing built. Goal: export the PO's items as print-ready labels, **one label per page at exact printer
dimensions**, so it's export → print → all labels in one go.
- **Likely approach:** a print-route (`@media print` + `@page { size: … }`) reusing the existing print pattern
  (`/inventory/restock` already does `window.print()` + `print:` styles), or a generated PDF for pixel-exact
  page size. One label per page, fields per label TBD.
- **NEEDED FROM OWNER to build (blocking):**
  1. **Printer model** + the **exact label + page dimensions** (label W×H, page size, margins, DPI) — owner
     has "the dimensions for how it's exported when it prints"; paste them.
  2. A **sample** of the current/expected export format (a file or screenshot of one label).
  3. **Fields per label** — item name? price? SKU/barcode (which symbology)? location/rack? vendor?
  4. Source: labels from a **purchase order / vendor batch**, or from `inventory_items`? (PO intake implied.)

## How to restart
Pick a thread, re-read its linked doc, confirm the open decisions above, then scope→build with the usual
cross-lane split (app = Claude via PRs to main; DB/edge-fn/deploy = Lovable). Smoke-test gate still applies to
any visitor-facing surface.
