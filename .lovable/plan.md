
## Migration: `2026_website_enablement.sql`

One migration, runs in dependency order. All new `public` tables get GRANTs + RLS + policies. All views are invoker-rights with explicit `GRANT SELECT ... TO anon`.

### 1. Enum additions
- `inventory_activity_action`: add `media_change`, `website_ready_change` (for trigger-driven log rows).
- New enum `media_view`: `daylight | actinic | video_still | other`.
- `inventory_media_tag` stays as-is (`website` remains the publish flag).

### 2. `inventory_items` column additions
- `is_wysiwyg boolean not null default false` — staff-flagged at intake.
- `specimen_notes text` — per-specimen blurb.
- `compare_at_price numeric(10,2)` — strike-through price.
- `is_house_line boolean not null default false`.
- `product_id uuid references public.products(id) on delete set null` (nullable; PDP falls back).
- `is_website_ready boolean not null default false` — derived, trigger-maintained.

### 3. `inventory_media` column additions
- `view media_view` (nullable).
- `is_primary boolean not null default false`.
- Partial unique index: `(inventory_item_id) WHERE is_primary`.

### 4. `products`
- `description text` — evergreen species copy (if not already present; confirm and skip if so).

### 5. `store_locations` NAP + hours
- `address_line1/2 text`, `city text`, `region text`, `postal_code text`, `country text default 'US'`.
- `phone text`, `public_email text`.
- `hours jsonb` (shape: `{ mon: [{open,close}], ... }`).
- `lat double precision`, `lng double precision`.

### 6. New table `collections`
- `id uuid pk`, `slug text unique not null`, `title text not null`, `description text`, `hero_media_id uuid → inventory_media`, `sort_order int default 0`, `is_published boolean default false`, `filter jsonb` (saved query), timestamps.
- GRANT SELECT to anon (published only via view), full CRUD to authenticated gated by `is_admin_or_dev`.
- RLS: anon — none on base; authenticated read all; write admin/dev only.

### 7. New table `site_settings`
- Singleton (`id bool pk default true check (id)`).
- `site_title text`, `tagline text`, `default_og_image_path text`, `social jsonb`, `announcement text`, `storage_base text`, timestamps.
- Admin/dev write only; authenticated read; anon read via view.

### 8. Storage: `public-media` bucket
- `insert into storage.buckets ... public = true on conflict do nothing`.
- Policies: public SELECT; admin/dev INSERT/UPDATE/DELETE.
- Staff "copy for website" action lives in a later app PR — out of scope here.

### 9. `is_website_ready` trigger
Trigger function recomputes per item:
```
is_website_ready := (
  pricing_status = 'approved'
  AND retail_price IS NOT NULL
  AND needs_photo = false
  AND item_name IS NOT NULL
  AND EXISTS (SELECT 1 FROM inventory_media
              WHERE inventory_item_id = items.id AND tag = 'website')
)
```
Triggers:
- `BEFORE INSERT/UPDATE ON inventory_items` — recompute on the NEW row.
- `AFTER INSERT/DELETE/UPDATE ON inventory_media` — UPDATE the parent `inventory_items.is_website_ready` for the affected `inventory_item_id` (covers tag flips). Re-entrancy safe because the inventory_items UPDATE only writes `is_website_ready`.
- Log `website_ready_change` to `inventory_activity_logs` on transitions.

### 10. Public read views (`public_read_models.sql` — same migration file)
All invoker-rights, `GRANT SELECT ... TO anon`, filter inside view WHERE:

- `v_public_inventory` — joins items + primary media + optional product. Filters: `is_website_ready = true AND availability_status IN ('available','on_hold') AND NOT is_house_line` (house-line gated separately if needed).
- `v_public_media` — only rows with `tag='website'` whose parent is website-ready; exposes `storage_path`, `view`, `is_primary`, `alt`.
- `v_public_collections` — published collections + hero media.
- `v_public_locations` — store_locations with NAP/hours where `is_public = true`.
- `v_public_site_settings` — singleton row.

Underlying base-table RLS stays locked to authenticated; anon reaches data only through these views.

### 11. GRANTs (every new table)
```
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;
-- no anon on base; anon reads via v_public_collections
```
Same shape for `site_settings`.

### 12. Backfill
- `UPDATE inventory_items SET is_website_ready = <expr>` once at end of migration so existing approved/photographed items light up immediately.

### Out of scope (deferred PRs)
- "Copy media to public-media" staff action.
- Collections admin UI.
- Site-settings admin UI.
- Public website code that consumes the views.

### Open confirmations before I write SQL
1. `products.description` — exists already? I'll check; if present, skip the ADD COLUMN.
2. `store_locations.is_public` — does it exist, or should the migration add it (default true for retail-facing kinds)?
3. House-line visibility on website: hide entirely from `v_public_inventory`, or include with a flag the frontend can filter? My default = include with the flag exposed (so house lines can be browsable on a dedicated collection).

Once you confirm those three, I'll ship the single migration in build mode.
