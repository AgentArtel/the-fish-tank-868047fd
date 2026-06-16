# Scope — App-lane cosmetic cleanups (auth-guard consolidation + `select("*")` tightening)

> **Status:** scoping only. Nothing implemented.
> **Priority:** low. Both items are **cosmetic / maintainability tech-debt surfaced by the
> production-readiness audit** — neither is a security hole or a functional bug today. The guards
> all *work*; they're just copy-pasted and slightly drifted. The `select("*")` reads all sit
> behind RLS + server-fn role gates, so they're over-fetch / future-proofing concerns, not live
> leaks. Bundle them into one focused App-lane pass when convenient.
> **Lane:** App (TypeScript only). **No DB/RLS/migration changes** — purely server-fn TS edits.

---

## Cleanup 1 — Consolidate the duplicated auth-guard helpers

### Current state (file:line evidence)

The guard quartet (`isAdmin`, `requireActive`, `requireAdmin`, `requireEditor`) is re-defined or
inlined in **8** `*.functions.ts` files. They share the same role model but have drifted in shape,
ordering, and which subset each file defines.

**Canonical full quartet (identical text), used as the reference implementation:**

- `src/lib/ops.functions.ts:8-29` — defines `isAdmin`, `requireActive`, `requireEditor`
  (note: ops does **not** define a `requireAdmin`; its admin-only fns inline the check — see drift below).
- `src/lib/clover.functions.ts:7-30` — all four; header comment `// guards (mirror ops.functions.ts)`.
- `src/lib/loyalty.functions.ts:8-31` — all four; header comment `// guards (mirror clover.functions.ts)`.
- `src/lib/scrape.functions.ts:8-31` — all four; header comment `// guards (mirrors ops.functions.ts)`.

The editor role-set is **identical in every file**: `admin || creator || reviewer`. `manager`,
`staff`, and `viewer` are deliberately **not** editors. `requireEditor` always calls
`requireActive` **first**, then checks the role. No file diverges on the editor set — good, nothing
to reconcile there.

**Partial / inlined definitions (the drift):**

- `src/lib/customers.functions.ts:6-18` — defines **only** `requireEditor`, and **inlines**
  `requireActive`'s body (reads `profiles.is_active`) directly inside it instead of calling a
  separate `requireActive`. Same role-set, same error strings.
- `src/lib/reports.functions.ts:6-18` — **only** `requireEditor`, same inlined-active pattern as
  customers. Comment `// guard (mirrors ops/clover.functions)`.
- `src/lib/workload.functions.ts:6-18` — **only** `requireEditor`, same inlined-active pattern.
- `src/lib/ai-settings.functions.ts:8-14` — defines **only** `requireAdmin`, and inlines
  everything: reads `is_active`, then checks `roles.some(r => r.role === "admin")` inline (no call
  to a shared `isAdmin`). Error strings differ slightly: `"Forbidden: admin only"` here vs
  `"Forbidden: admin role required"` in the clover/loyalty/scrape `requireAdmin`.
- `src/lib/cms.functions.ts` — **no named guards at all**; every handler inlines its checks:
  - `getMe` (`:6-20`) — no gate beyond `requireSupabaseAuth` (intentional: it *is* the "who am I"
    call; returns `isActive` to the client).
  - `updateContentStatus` (`:30-31`, `:40-42`) — inlines active-check, then inlines a
    reviewer-OR-admin check for the `approved` transition (a **different** role-set: `admin ||
    reviewer`, *not* the editor set — this is a domain rule, **must be preserved**, do not fold
    into `requireEditor`).
  - `getSignedUrl` (`:58-59`) — inlines active-check only.
  - `approveUser` / `setUserRole` / `setUserActive` / `inviteUser` (`:76-77`, `:93-94`,
    `:105-106`, `:120-121`) — each inlines an **admin-only** check via
    `roles.some(r => r.role === "admin")` with error string `"Admins only"` (different again).

**Drift summary that must be reconciled into the canonical module:**

| Concern | Canonical (clover/loyalty/scrape) | Divergent sites |
|---|---|---|
| `requireActive` as its own fn | yes | inlined in customers/reports/workload/ai-settings/cms |
| admin error string | `"Forbidden: admin role required"` | ai-settings: `"Forbidden: admin only"`; cms: `"Admins only"` |
| `requireActive`-only (any active user) | n/a | **feedback.functions.ts:6-13 — INTENTIONAL, must stay** |
| reviewer-or-admin gate (not editor) | n/a | cms `updateContentStatus` approve branch — domain rule, keep |
| ordering: `requireActive` then role | always | `ops.approveLinePricing`/`approveInventoryPricing` call `isAdmin` **before** `requireActive` (see below) |

**Intentional difference to preserve (do NOT "fix"):**

- `src/lib/feedback.functions.ts:6-13` defines a **`requireActive`-only** guard — any active
  (approved) user may file feedback, no editor/admin gate. The canonical `requireActive` exported
  from the shared module is exactly what it needs; keep the "any active user" semantics. The
  in-file comment at `:5` documents this.

**Ordering nuance to flag (not blocking, but note during the pass):**

- `src/lib/ops.functions.ts` admin-only handlers `approveLinePricing` (`:67-68`),
  `approveInventoryPricing` (`:94-95`), `convertLineItemsToInventory` (`:125-127`), and
  `reviewInventoryItem` (`:496-498`) check `isAdmin(...)` **first** and call `requireActive(...)`
  **after**. The canonical `requireAdmin` does the reverse (active-first). Behaviour is equivalent
  (both must pass), but switching these to a single `requireAdmin(...)` call changes the *order* of
  the two DB reads and the error surfaced when a user is both inactive *and* non-admin (they'd now
  get "pending approval" instead of "Only admins can…"). The bespoke error strings here
  ("Only admins can approve pricing", "Only admins can convert…", "Only admins can approve pricing
  and take items live") are **user-facing and intentional** — if these switch to `requireAdmin`
  they lose those messages. **Decision needed:** either (a) keep these four inline (don't touch the
  message), or (b) add an optional `message` param to the shared `requireAdmin`. Recommend (a) —
  smaller blast radius, preserves UX copy.

### Proposed change

Create **`src/lib/auth-guards.ts`** exporting the canonical four:

```ts
// src/lib/auth-guards.ts
export async function isAdmin(supabase: any, userId: string): Promise<boolean> { /* roles.some admin */ }
export async function requireActive(supabase: any, userId: string): Promise<void> { /* is_active gate */ }
export async function requireAdmin(supabase: any, userId: string): Promise<void> { /* active-first, then isAdmin */ }
export async function requireEditor(supabase: any, userId: string): Promise<void> { /* active-first, then admin|creator|reviewer */ }
```

Use the verbatim bodies from `clover.functions.ts:7-30` (the most complete + un-inlined copy) and
the canonical error strings (`"Forbidden: account pending approval"`,
`"Forbidden: admin role required"`, `"Forbidden: editor role required"`). Then each call site
deletes its local defs and adds `import { ... } from "@/lib/auth-guards";`.

### Affected files checklist

- [ ] **create** `src/lib/auth-guards.ts` (canonical quartet).
- [ ] `src/lib/clover.functions.ts` — delete local guards `:7-30`, import. (drop-in; identical)
- [ ] `src/lib/loyalty.functions.ts` — delete `:8-31`, import. (drop-in; identical)
- [ ] `src/lib/scrape.functions.ts` — delete `:8-31`, import. (drop-in; identical)
- [ ] `src/lib/ops.functions.ts` — delete `:8-29`, import `isAdmin/requireActive/requireEditor`.
      **Leave the four admin-only handlers' inline `isAdmin`-then-`requireActive` checks as-is** to
      preserve their bespoke error copy (or consciously migrate per decision above).
- [ ] `src/lib/customers.functions.ts` — delete `:6-18`, import `requireEditor`.
- [ ] `src/lib/reports.functions.ts` — delete `:6-18`, import `requireEditor`.
- [ ] `src/lib/workload.functions.ts` — delete `:6-18`, import `requireEditor`.
- [ ] `src/lib/ai-settings.functions.ts` — delete `:8-14`, import `requireAdmin`. **Reconcile error
      string** `"Forbidden: admin only"` → canonical `"Forbidden: admin role required"` (or keep —
      decision: cosmetic, recommend adopting canonical for consistency).
- [ ] `src/lib/feedback.functions.ts` — replace local `requireActive` `:6-13` with the imported
      `requireActive`. **Preserve "any active user" behaviour** (it already only calls
      `requireActive`, so this is a pure dedupe). Keep the `:5` comment.
- [ ] `src/lib/cms.functions.ts` — **optional/lower-value**. The admin-only fns
      (`approveUser`/`setUserRole`/`setUserActive`/`inviteUser`) could switch to the imported
      `requireAdmin`, but they currently use `"Admins only"` and check **only** role (no active
      gate — an admin approving users is implicitly active). The `updateContentStatus` approve
      branch uses an `admin||reviewer` set that is **not** in the shared module — leave inline.
      Recommend: convert the four admin fns to `requireAdmin` *only if* the "Admins only" copy and
      the added active-check are acceptable; otherwise skip cms in this pass.

### Risks / decisions needed

1. **Error-message changes are user-visible.** ai-settings ("admin only"), cms ("Admins only"),
   and ops' bespoke pricing messages all differ from the canonical strings. Decide per-site whether
   to standardize or preserve. Default recommendation: standardize ai-settings; preserve ops'
   pricing/convert/go-live messages (they read better for admins); leave cms inline.
2. **Read-order change in ops** (see ordering nuance) — equivalent outcome, slightly different
   error precedence + one extra/fewer early return. Recommend leaving ops' admin handlers inline.
3. **No role-set divergence to reconcile** — editor = `admin|creator|reviewer` everywhere; safe.
4. **`catalog.functions.ts` is correctly out of scope** — it's the *public, unauthenticated*
   catalog (`getPublicCatalog`, no `requireSupabaseAuth`, no guards). Do not add guards.
5. **Type signatures** — every guard takes `(supabase: any, userId: string)`. Keep `any` to avoid a
   typing yak-shave; tightening the Supabase client type is out of scope for a cosmetic pass.

---

## Cleanup 2 — Tighten `select("*")` reads

### Current state (file:line evidence)

Seven `.select("*")` reads exist in the server-fn layer. Below, each with the columns the code
**actually consumes downstream**, so the replacement column list is exact.

| # | Location | Table | Columns actually used | Sensitivity | Returned to client? |
|---|---|---|---|---|---|
| 1 | `src/lib/cms.functions.ts:11` (`getMe`) | `profiles` | `is_active` (→ `isActive`) + the whole `profile` object is returned, but the **only** client read is `email` (`src/routes/_app.tsx:266`). | **Sensitive (PII).** profiles has `email`, `display_name`, `avatar_url`, `approved_by`, etc. | **Yes** — full row goes to client. |
| 2 | `src/lib/customers.functions.ts:94` (`getCustomer`) | `customers` | `id, first_name, last_name, email, phone, marketing_consent, notes, first_seen_at, last_seen_at` (all consumed in the return mapper `:124-136` + `displayName()`). | **Sensitive (customer PII).** | Only the mapped subset is returned (not the raw `*`), but `*` is still fetched. |
| 3 | `src/lib/feedback.functions.ts:74` (`submitFeedback`) | `profiles` | `email`, `full_name`, `display_name`, `name` (fallback chain at `:77-78`). Of these only `email` + `display_name` exist on the table; `full_name`/`name` are defensive `undefined`. | **Sensitive (PII)** but server-only (used to build issue body; not returned to client). | No — server-side only. |
| 4 | `src/lib/ai-settings.functions.ts:28` (`getAISettings`) | `workspace_ai_settings` | `id, provider, openai_api_key, openai_model_pro, openai_model_flash, gemini_api_key, gemini_model_pro, gemini_model_flash, fallback_to_lovable, last_used_at, last_used_provider, last_error, updated_at` (all read at `:34-48`). | **Very sensitive (API keys)** — but keys are **masked** before return (`mask()`), never sent raw. Fetched via `supabaseAdmin` (service role). | Masked subset only. |
| 5 | `src/lib/clover.functions.ts:49` (`getCloverOverview`) | `clover_connection` | `connected, last_import_at, last_sale_synced_at` (read at `:69-71`). | Benign (status row, single connection record). | Derived booleans/timestamps only. |
| 6 | `src/lib/ops.functions.ts:130` (`convertLineItemsToInventory`) | `vendor_line_items` | Many fields consumed when building the inventory insert `:155-188`: `id, converted_inventory_item_id, kind, review_status, pricing_status, received_quantity, quantity, lost_quantity, vendor_batch_id, vendor_id, clean_item_name, raw_description, scientific_name, item_type, category, subcategory, origin_region, size, wholesale_cost, approved_retail_price, assigned_location_id, received_at, received_by`. | Benign (internal vendor data, editor-gated). | No — used to build inserts only. |
| 7 | `src/lib/ops.functions.ts:750` (`extractBatchWithAI`) | `vendor_batches` | `id, pdf_storage_path, notes, vendor_id, intake_status` + all 16 `headerKeys` (`:934-951`) read at `:953`. | Benign. | No — server-side only. |

> **Note on the task's loyalty hint:** `recordLoyaltyEntry` (`loyalty.functions.ts:161`) does **not**
> contain a `.select("*")` — it reads no profile row. No change needed there. The grep confirms the
> seven sites above are the complete set in the server-fn layer.

### Proposed change

Replace `*` with the explicit column lists above. Priority order is by sensitivity + client
exposure:

- **High value (sensitive + crosses the client boundary):**
  - #1 `getMe` → `.select("id, email, display_name, avatar_url, is_active")`. The widest-reaching
    fix: the full profile row is currently shipped to every authenticated client on app load.
    Confirm no other consumer of `useMe().profile` needs a field beyond `email`/`is_active` — grep
    shows only `_app.tsx:266` reads `.email`. **Decision:** include `display_name`/`avatar_url` for
    headroom (cheap, non-sensitive) or trim to just `id, email, is_active`.
  - #2 `getCustomer` → explicit 9-column customer list (already enumerated above).
- **Medium (sensitive but server-only / masked):**
  - #3 `submitFeedback` → `.select("email, display_name")` (drop the non-existent `full_name`/`name`
    fallbacks, or keep them harmlessly — they resolve to `undefined`).
  - #4 `getAISettings` → explicit 13-column list. Defensive against a future sensitive column being
    auto-included before `mask()` is wired for it.
- **Low (benign, do for consistency):**
  - #5 `getCloverOverview` → `.select("connected, last_import_at, last_sale_synced_at")`.
  - #6 / #7 ops reads → explicit lists. These are the longest lists; lowest payoff. Optional.

### Affected files checklist

- [ ] `src/lib/cms.functions.ts:11` (`getMe`) — **highest value.**
- [ ] `src/lib/customers.functions.ts:94` (`getCustomer`).
- [ ] `src/lib/feedback.functions.ts:74` (`submitFeedback`).
- [ ] `src/lib/ai-settings.functions.ts:28` (`getAISettings`).
- [ ] `src/lib/clover.functions.ts:49` (`getCloverOverview`).
- [ ] `src/lib/ops.functions.ts:130` (`convertLineItemsToInventory`) — optional.
- [ ] `src/lib/ops.functions.ts:750` (`extractBatchWithAI`) — optional.

### Risks / decisions needed

1. **Forgetting a consumed column** silently nulls a field. The two cross-boundary reads (#1, #2)
   are the only ones where a missed column would surface in the UI; both have their consumers
   enumerated above, so the lists are exhaustive. The server-only reads (#3–#7) would surface as a
   handler error, caught quickly.
2. **`getMe` is the one to get right** — its row reaches every client. Re-grep `me?.profile` /
   `useMe()` consumers right before editing (currently only `_app.tsx:266` → `.email`).
3. **ops #6/#7 are large lists and the read is internal + editor-gated** — low payoff, real risk of
   missing a column. Treat as optional / lowest priority; arguably leave `*` there.
4. **No DB or RLS change** — RLS already constrains these rows; this is purely narrowing the
   projection. Pure App-lane.

---

## Effort estimate & recommended order

| Item | Effort | Risk | Value |
|---|---|---|---|
| C1 — guard consolidation (drop-in files: clover, loyalty, scrape, customers, reports, workload, feedback) | ~30–45 min | low | medium (maintainability) |
| C1 — reconcile sites (ops inline admins, ai-settings, cms) | ~20–30 min | low-medium (error-copy decisions) | medium |
| C2 — high-value `select` (getMe, getCustomer, submitFeedback, getAISettings) | ~20 min | low | medium (PII/key over-fetch) |
| C2 — benign `select` (clover overview, ops x2) | ~15 min | low | low |

**Recommended order (single focused pass):**

1. **C2 high-value first** (`getMe`, `getCustomer`, `submitFeedback`, `getAISettings`) — smallest
   diffs, clearest wins, no cross-file coupling.
2. **C1 create `auth-guards.ts`** + swap the **7 drop-in files** (clover, loyalty, scrape,
   customers, reports, workload, feedback) — mechanical, zero behaviour change.
3. **C1 reconcile** ai-settings (error string) + decide on ops inline admins + cms (recommend:
   standardize ai-settings, leave ops pricing messages + cms inline). Document any kept divergence
   in a one-line comment so the next audit doesn't re-flag it.
4. **C2 benign reads** (clover overview, optionally the two ops reads) — last, lowest payoff.

Whole bundle: **roughly 1.5–2 hours**, all TypeScript, no DB/RLS/migration, no routing or
component-hierarchy change. Verify with a typecheck + a smoke of: app load (getMe → header email),
a customer detail open (getCustomer), Settings → AI (getAISettings masking), and one editor +
one admin action (guard swap).
