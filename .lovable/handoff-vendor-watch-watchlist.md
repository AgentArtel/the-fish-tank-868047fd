# Hand-off — Vendor Watch: coral-type watchlist table (for Lovable / DB owner)

Date: 2026-06-13 · Author: Claude Code. One small table to back the shop-wide
"track a coral type across all vendors" watchlist. No other schema needed.

## Context

Coral-type classification already shipped **app-side** (no DB): a deterministic
title classifier (`src/lib/coral-type.ts`) tags each feed event with a type
(acro, chalice, zoa, euphyllia, …), and the feed has a type filter. We classify
on the fly — **no `coral_type` column required** for now (that's a later
optimization for AI backfill / heavy queries).

The only thing that needs persistence is the **set of tracked types** — it's
**shop-wide** (boss's call: shared rules), so it can't live in localStorage.

## The migration to ship

```sql
CREATE TABLE public.tracked_coral_types (
  coral_type text PRIMARY KEY,          -- classifier slug: 'acro','chalice','zoa',...
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.tracked_coral_types TO authenticated;
GRANT ALL ON public.tracked_coral_types TO service_role;

ALTER TABLE public.tracked_coral_types ENABLE ROW LEVEL SECURITY;

-- Shop-wide shared watchlist: any editor can view and manage it.
CREATE POLICY "tct select editor" ON public.tracked_coral_types
  FOR SELECT TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "tct insert editor" ON public.tracked_coral_types
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "tct delete editor" ON public.tracked_coral_types
  FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));
```

That's the whole DB change — a single PK'd string set. No trigger, no enum
(the slug is validated app-side against the classifier's known types).

## What I'll build once it's live (Claude's lane)

- `listTrackedCoralTypes` / `setTrackedCoralType(type, tracked)` editor server fns.
- Feed: a **★ Watchlist** filter (only tracked-type events) + a star highlight on
  tracked-type rows + a track/untrack toggle on the type filter. Notify-only /
  in-app for now (loud SMS/push stays the parked later phase).

## Not in scope (deferred)
- `coral_type` column on `vendor_scrape_items` — only if we later want indexed
  type queries or an AI-classified backfill; on-the-fly classification covers the
  current need.
- Per-item "watch this exact item" / to-order flags — the separate tagging
  scaffold, after this.
- Loud alerts (SMS/push) — later phase; alerts route to the boss per the locked
  decision.
