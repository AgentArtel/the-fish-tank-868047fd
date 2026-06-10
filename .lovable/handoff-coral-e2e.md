# Hand-off — Coral loop end-to-end test (browser automation)

Date: 2026-06-10 · Owner of this run: **Lovable (browser automation lane)**

Goal: prove the full **discover → tag → review → price → take-live → public catalog**
loop works against the live app, with the DB gates enforcing as designed. This is the
"first real-tank run" gate from `REALITY_MAP.md` — except we drive it with a clearly
labelled throwaway coral so it's safe to run repeatedly and easy to clean up.

> **Selector strategy:** there are **no `data-testid` attributes** on these surfaces.
> Target elements by their **verbatim visible text / label / placeholder** (all quoted
> below). Where a field has no label hook, use the placeholder or the `autoFocus` input.

---

## Prerequisites (the human supplies these)

1. **App base URL** — the deployed preview/prod origin (e.g. `https://<app>.lovable.app`).
2. **Admin login** — email + password for an **active admin** account (the approve step
   is admin-only; discovery + take-live need an editor, admin covers both).
3. **At least one coral-holding location exists** — a `coral_system` / `frag_tank` /
   `growout_tank` (etc.). The discovery picker auto-selects the first coral system. If the
   shop has none, create one location first (or the picker will be empty).

## Test data (use exactly this so it's identifiable + collision-free)

- **Coral name:** `ZZ E2E TEST CORAL <UTC-timestamp>` (the `ZZ` prefix sorts it last and
  flags it as a test row).
- **Plug / rack tag:** `ZE9` (unlikely to collide with real B/X/H codes; if the picker
  warns it's already tagged, bump to `ZE8`, `ZE7`, …).
- **Inventory role:** `For sale` ← **required** — only `for_sale` lands the draft in
  `incoming`, which is the only state the Pricing Queue coral-drafts section reads. Growout /
  mother colony / frag source → `not_for_sale`, Hold → `on_hold`; none of those appear in
  the queue, so the loop can't continue with them.
- **Retail price:** `45` (approve step).
- **Quantity:** `1`.
- **Photo:** any small image file (a real photo on file lets "Take live" skip the wizard;
  see Variant B to exercise the wizard instead).

---

## Steps & assertions

### 0. Log in
- Go to `/login`.
- Fill `#email` and `#password`; click **"Sign in"**.
- **PASS:** redirected to `/dashboard` (no auth-error toast).

### 1. Discover + plug-tag the coral
- Go to `/inventory/coral-discovery`.
- In the **"Coral system"** picker (placeholder **"Choose a system…"**) select a coral system
  (or accept the auto-selected first one).
- Fill the capture form:
  - **Coral name *** (the `autoFocus` input, placeholder `"e.g. Rainbow Hornet Acan"`) → the test name.
  - **Plug / rack tag *** (placeholder `"B3"`, mono/uppercase) → `ZE9`.
  - **Inventory role** select → **"For sale"**.
  - **Price (if known)** → leave blank (we price it in the queue) — or set it; pricing still
    needs admin **Approve** either way.
  - **Quantity / frags** → `1`.
  - **Photo** → upload the test image (the dashed **"Tap to photograph the coral"** input;
    `<input type="file" accept="image/*">`). *Skip this for Variant B.*
- Click **"Save & next"**.
- **PASS:**
  - Success toast `Saved "ZZ E2E TEST CORAL …@ZE9"`.
  - The **"Logged this session"** list now shows the row with a `ZE9` position badge.
  - No "Plug ZE9 is already tagged…" warning blocked the save (if it did, change the tag).

### 2. Verify it's a safe draft (never auto-live)
- Go to `/inventory?type=coral`.
- Find the test row (search box placeholder **"Search item name…"**).
- **PASS:**
  - The **"Plug"** column shows `ZE9` (mono badge).
  - **Availability** = an `incoming`-type status, **not** `available`.
  - **Pricing** badge = not priced / not approved.
  - **Retail** is empty/0.

### 3. Approve pricing (admin-only)
- Go to `/pricing-approval`.
- In the **"Coral drafts"** section (subtitle **"— from Coral Discovery"**), find the test row
  by name + `ZE9` plug.
- In the **"Retail"** input (right column) type `45`; click **"Approve"**.
- **PASS:**
  - Toast **"Pricing approved"**.
  - Row flips to an **Approved** state showing the price and a **"Take live"** button.

### 4. Take it live (photo gate)
- Click **"Take live"** on the test row.
- With a photo already on file (Step 1): no wizard → completes directly.
- **PASS:** toast `ZZ E2E TEST CORAL … is live`. Row leaves the coral-drafts queue.

### 5. Confirm public catalog (customer view + no data leak)
- Open `/catalog` in a **logged-out / incognito** context (it's public, no auth).
- Search the test name in the **"Search by name or scientific name…"** box (or filter
  category → Coral).
- **PASS:**
  - A card for the test coral appears with its **photo**, **price ($45.00)**, and a **"Coral"**
    type badge.
  - **No** cost, wholesale, vendor, internal status, or location-internal data is visible
    anywhere on the card (sanitized projection). ← this is a key assertion.

### 6. Teardown (important — it's on the public catalog)
- Back in `/inventory?type=coral`, open the test row and set **Availability** to **"Not for sale"**
  (or "On hold").
- **PASS:** re-load `/catalog` (incognito) and confirm the test coral is **gone** from the
  customer view.
- Note: items aren't hard-deleted from this UI. Leaving it `not_for_sale` is sufficient; if
  you want it fully removed, flag it for manual DB cleanup (it's named `ZZ E2E TEST CORAL …`).

---

## Variant B (optional) — exercise the photo-on-file wizard

Run Steps 1–4 but **skip the photo at capture** (the toast will read
`… — add a photo later`, and `needs_photo` is set). At Step 4, clicking **"Take live"** should
**open the PhotoOnFileWizard modal** instead of completing. Upload the test image in the wizard,
finish, and assert the same `… is live` toast. This proves the "no item goes `available` without
a photo" gate fires through the take-live path.

---

## What a green run proves

- Plug tagging is captured, stored (`attrs.rack_position`), and surfaced on `/inventory` + queue.
- Discovery drafts are **never** auto-`available` (Step 2).
- Pricing approval is **admin-gated** and required before go-live (Step 3).
- The photo gate holds on the take-live path (Variant B).
- The public projection is **sanitized** — no internal/cost/vendor leak (Step 5).

## Report back

Post a short result to `.lovable/devlog.md` (and ping the thread): per-step PASS/FAIL, the
final `/catalog` screenshot, any toast/assertion that didn't match the verbatim strings above,
and confirm teardown (Step 6) removed the test coral from the public view.
