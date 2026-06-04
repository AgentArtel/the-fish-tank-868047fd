## Sprint plan

Each sprint ends with: (1) append a new dated section to `.lovable/devlog.md` (newest on top, planned-vs-shipped table, migrations referenced, "what's next" mirrored from `mem://features/intake-roadmap`), and (2) update the roadmap memory to reflect what shipped.

---

### Sprint 1 — OCR / image tagging on photo upload

**Goal:** when a photo is uploaded for a livestock or dry-goods item, the system extracts visible label/tag text and proposes `item_type`, `item_name`, and `retail_price`.

- Extend the existing `parseTagPhoto` server fn (Gemini 2.5 Flash vision) into a reusable `extractFromPhoto` that returns: `{ item_type, item_name, scientific_name, retail_price, raw_text, confidence, has_price_tag }`.
- Wire it into the Quick Add FAB photo path AND the inventory detail "primary photo" upload path — on upload, run extraction, show a "Proposed" panel the user accepts/edits before save.
- Auto-flag `inventory_media.has_price_tag` when the model detects a price.
- Soft-prompt if no price tag is detected on a primary livestock/dry-goods photo (banner, not a block).
- Surface a "Re-run extraction" button on the media row.

No new tables. No migration unless we decide to cache raw OCR text (`inventory_media.ocr_text`, `ocr_extracted_at`) — included as a small optional migration in this sprint.

---

### Sprint 2 — Bulk import from pasted markdown

**Goal:** paste a markdown list (tags/labels copy-paste, or AI-generated list) and create many items at once with dedupe.

- Extend `parseInventoryMarkdown` to return normalized rows + a `duplicate_of` field by matching against existing `inventory_items` on (case-insensitive) `item_name` OR a future `tag` field.
- New server fn `bulkCreateInventoryItems` — atomic, editor-gated, creates rows into today's Quick Add batch, skips/merges duplicates per user choice (skip / update qty / create anyway).
- UI: a "Bulk paste" tab in the Quick Add dialog with a reviewable grid (editable cells, dedupe badge, per-row skip toggle, per-row item_type override).
- Result toast with counts: created / skipped / merged.

No schema change required unless we add a `tag` column to `inventory_items` for cleaner dedupe — proposed as a small migration in this sprint.

---

### Sprint 3 — One-time "photo on file" wizard

**Goal:** the first time an item moves to `availability_status='available'` without a photo, open a modal wizard that walks the user through taking/uploading the required photo. After completion, never prompt again for that item.

- Add `inventory_items.photo_wizard_completed_at timestamptz` (migration).
- Keep the existing `guard_inventory_photo_required` trigger as the hard block.
- Client-side: intercept the availability change to `available`; if no photo exists, open the wizard instead of firing the server call. Wizard handles capture/upload → primary photo save → re-attempt availability change.
- After success, set `photo_wizard_completed_at = now()` so the wizard never reopens for that item even if photos are later deleted (banner still warns, but no forced wizard).
- Missing-photo banner stays for visibility; the wizard is the action.

---

### Sprint 4 — "Missing price-tag photo" export

**Goal:** a one-click export of all items lacking a price-tag photo, for a restock photo run.

- Server fn `listItemsMissingPriceTagPhoto` — returns items where no `inventory_media` row has `has_price_tag=true`, scoped by optional `item_type` and `location_id` filters.
- New page `/_app/missing-photos` (or section under Inventory) with filter chips, a table, and two export buttons:
  - **CSV** — id, item_name, item_type, location, last_seen, retail_price.
  - **Printable sheet** — print-styled HTML (`window.print`) with checkboxes, location grouping, and item barcode placeholders, designed for a clipboard walk.
- Link from the Missing-photo banner: "Add to restock list".

---

### Sprint 5 — Audit pass

After sprints 1–4 ship:

- Use browser automation to walk through: login → Quick Add (manual + photo OCR + bulk paste) → Receive flow (with DOA) → Convert to inventory → Availability change (wizard trigger) → Missing-photo export → Admin pricing approval.
- Capture screenshots and console/network errors at each step.
- Write results to `.lovable/audit-2026-06-04.md`: per-flow pass/fail, defects found, follow-up tasks.
- File any regressions back into `mem://features/intake-roadmap` and the devlog "what's next" list.

---

### Standing rules (carry through every sprint)

- AI can propose, never approve pricing/review/inventory conversion.
- All mutating server fns gated by `requireEditor` (or admin where applicable).
- Devlog updated at end of every sprint; roadmap memory kept in sync.
- No new public-schema tables without GRANTs + RLS in the same migration.

### Order of execution

Sprint 1 → 2 → 3 → 4 → 5. Each sprint is independently shippable; I'll pause for your approval between sprints so you can test.
