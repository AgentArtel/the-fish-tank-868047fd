# Handoff → Lovable: storefront availability model (sourceable items stop vanishing) + publish edge fn

The NOW slice of the availability model (approved). Goal: an out-of-stock item we **can re-order stops
disappearing** from the site — it stays listed and shows a simple pickup ETA. True one-offs (WYSIWYG) still
drop when sold. Plus the edge function that powers the staff "Publish to website" action. (Future commerce /
portal / membership is parked in `scope-storefront-commerce.md` — **not** this.)

All `[DB=Lovable]` / `[EdgeFn=Lovable deploy]`. The app reads these fields and reacts; Claude builds the
storefront display + publish UI against this contract.

## 1. `sourceable` flag on `inventory_items`  `[DB=Lovable]`
"Can we get this again?" — the keystone that decides persist-vs-drop when sold out.
- Add column **`sourceable boolean` NULLABLE** (NULL = "auto, derive from type"; non-null = explicit staff
  override). This avoids any backfill.
- Effective value everywhere = **`COALESCE(sourceable, NOT is_wysiwyg)`** → non-WYSIWYG (dry goods, generic
  livestock) default **sourceable**; WYSIWYG one-offs default **not**. Staff can override either way.
- Please expose a `set_inventory_sourceable(item_id, value boolean | null)` RPC (or confirm a direct
  `is_active`+editor-gated update path) so the app toggle can write it.

## 2. `v_public_inventory` — keep sold-out **sourceable** rows  `[DB=Lovable]`
Today the view filters `availability_status IN ('available','on_hold')`, so sold-out items vanish. Change to
also keep sold-out rows **when sourceable**:
```sql
AND (
  i.availability_status IN ('available','on_hold')
  OR (i.availability_status = 'sold_out'
      AND COALESCE(i.sourceable, NOT i.is_wysiwyg) = true)
)
```
And **project two fields** the storefront needs to pick the display state:
- `i.availability_status` (already present) — in-stock vs sold-out.
- `COALESCE(i.sourceable, NOT i.is_wysiwyg) AS sourceable` — drives "order now · pickup [date]" on sold-out.

`is_website_ready` already persists through a sell-down (its conditions don't include stock), so a published
item that sells out stays `is_website_ready = true` and — with this change — stays visible if sourceable.

> **Location:** NOT a trigger condition (a sold-out sourceable item may have no current location, and we don't
> want that to yank it off the site). Location is enforced in the app's **Publish** flow at publish time only.
> No DB change needed for location here.

## 3. Store **order-cycle** setting → public view  `[DB=Lovable]`
Powers the pickup-ETA copy. Add to `site_settings.data` and project onto `v_public_site_settings`:
```json
"order_cycle": { "cutoff_day": "Sunday", "ready_day": "Wednesday" }
```
Expose as `order_cycle jsonb` on `v_public_site_settings` (or via the raw `data` column you already project).
Copy the storefront will render (kept deliberately simple): **"Order by Sunday · pickup Wednesday."**

## 4. "Publish to website" image copy — **edge function**  `[EdgeFn=Lovable deploy]`
The staff Publish action (UI is Claude's) needs an item's primary photo moved from the **private
`inventory-media`** bucket into the **public `public-media`** bucket. Per Engineering Rule 7 (image copy /
heavy I/O = edge function, not the app Worker), this is an edge fn. Either party authors the Deno; Lovable
deploys + holds secrets.
- **Input:** `inventory_item_id` (caller already auth-gated editor/admin; the item is price-approved + has a
  photo + has a location — the app enforces those before invoking).
- **Do:** copy the item's primary `inventory-media` object → `public-media` at a clean path
  (suggest `inventory/<item_id>/<filename>`); upsert an `inventory_media` row `tag='website'`,
  `is_primary=true`, `storage_path` = the new public path. Idempotent (re-publish overwrites, doesn't dupe).
- **Effect:** the existing `compute_inventory_website_ready` trigger flips `is_website_ready=true` → the item
  appears in `v_public_inventory` → storefront shows it next load. The app invokes + reacts to table state
  (never blocks on the copy).
- Tell us the invoke contract (function name + payload + auth header) so the app wires the invoke.

## Reply with
Columns/RPC names as built, the updated view (confirm the two projected fields + the sold-out-sourceable
clause), `order_cycle` on `v_public_site_settings`, and the publish edge fn's invoke contract. Then I'll build
the storefront display states (in-stock / order-now-pickup-[date] / dropped) + the Publish + sourceable-toggle UI.
