## The Fish Tank CMS — Build Plan (Revised)

Internal content management tool for an aquarium retail business. Built on TanStack Start + Lovable Cloud (Supabase), private media storage, role-based access, **invite/approval gated**. No Meta posting — export-only for now.

### Stack & foundations
- Enable Lovable Cloud (Supabase) for DB, Auth, Storage, RLS.
- Auth: email/password signup is allowed, but **access is gated**. New users land on a "Pending approval" screen until an admin approves them. First signed-up user is auto-approved as admin.
- Roles in a separate `user_roles` table with enum `app_role` (`admin`, `creator`, `reviewer`) + `has_role()` SECURITY DEFINER function. Never store roles on profiles.
- Private storage bucket `media` with signed URLs generated on demand via a server function.
- Design: Cloud White palette (#fafbfc / #e8ecf1 / #94a3b8 / #3b82f6) wired into `src/styles.css` as semantic tokens. Clean dashboard, cards, tables, status badges. Mobile-friendly Tailwind.

### Access gate (revised)
- `profiles` gets `is_active boolean default false`, `approved_at timestamptz`, `approved_by uuid`.
- DB trigger on signup: creates profile; if `user_roles` is empty, marks `is_active=true`, `approved_at=now()`, and assigns `admin` role. Otherwise profile stays inactive with no role.
- `_authenticated` `beforeLoad` checks `profiles.is_active`. If false → redirect to `/pending-approval`.
- Admin `/settings/users` page lists pending users with Approve / assign role / deactivate actions.
- All RLS policies for content tables additionally require the caller's profile to be active (via SECURITY DEFINER helper `is_active_user(uid)`).

### Database schema (Supabase)
All tables in `public`, RLS enabled, GRANTs to `authenticated` and `service_role`.

- `profiles` — id (FK auth.users), display_name, avatar_url, **is_active, approved_at, approved_by**.
- `user_roles` — id, user_id, role (enum).
- `products` — id, name, **product_type** (enum: dry_good, fish, coral, invert, service, brand, general_content_subject), **is_livestock bool**, **availability_status** (enum: available, sold, ordered, unavailable, unknown), category, species_common_name, price, tank_location, description, care_notes, content_priority (low/med/high), website_ready bool, social_ready bool, created_by, timestamps. (Content-support only — no stock counts, no inventory transactions.)
- `campaigns` — id, name, purpose, start_date, end_date, status (planning/active/complete/archived), created_by, timestamps.
- `content_items` — title, content_type (enum), caption, short_caption, on_screen_text, hashtags (text[]), call_to_action, status (enum: idea/needs_media/drafting/needs_review/approved/scheduled/posted/archived), scheduled_date, posted_date, assigned_to, reviewer, notes, product_id (nullable FK), campaign_id (nullable FK), meta_publish_ready bool, created_by, timestamps.
- `content_platforms` — id, content_item_id, platform (enum: facebook/instagram/tiktok/youtube_shorts/google_business), **post_url, posted_at**. **Sole home for final post URL + posted timestamp per platform.**
- `media_assets` — id, storage_path, file_name, media_type (image/video), product_id (nullable), alt_text, platform_crop_notes, usage_status (unused/in_use/archived), date_captured, captured_by, uploader_id, **source_type** (enum: phone_upload, camera_upload, vendor_asset, ai_generated, edited_asset), **source_notes text**, **usage_rights** (enum: owned, vendor_allowed, needs_permission, unknown), timestamps.
- `content_media` — junction: content_item_id, media_asset_id, sort_order.
- `publishing_checklists` — id, content_item_id, platform, **readiness booleans only**: caption_ready, media_attached, hashtags_ready, cta_ready, schedule_selected, manually_posted, post_url_saved, updated_at. **No URL stored here** — UI reads URL from `content_platforms`.
- `meta_connection_settings` — single-row config table. Non-secret metadata only: meta_business_id, facebook_page_id, instagram_business_account_id, connected_status, last_sync_time, token_expiration_date, permissions_checklist (jsonb), notes. **No tokens, no OAuth, no Graph API calls in v1.**

### RLS policy summary
- `profiles`: users select all, update own (cannot self-approve); admins update any.
- `user_roles`: select own; admin manages all (via `has_role`).
- Content tables (`products`, `campaigns`, `content_items`, `media_assets`, `content_media`, `content_platforms`, `publishing_checklists`): authenticated **and active** users can read; creators/admins insert/update; admins delete; reviewers may transition status into `approved` or back to `drafting`.
- `meta_connection_settings`: admin-only.

### Status workflow (revised — allows backward moves)
Enforced in server fn `updateContentStatus`:
- Forward: idea → (needs_media | drafting) → needs_review → approved → scheduled → posted.
- **Backward allowed**: needs_review → drafting, approved → drafting, scheduled → approved.
- **Any → archived** at any time.
- Reviewer or admin required to enter `approved`.

### Routes (TanStack Start, file-based)
- `/login`, `/signup`, `/pending-approval` — public.
- `/_authenticated/` layout — guards via `beforeLoad` (auth + active check).
  - `/` Dashboard — counts per status, upcoming-by-date, platform-readiness grid, "needs media" queue.
  - `/calendar` — month + list view, filters (platform, status, type, campaign, product, assignee), inline new.
  - `/content`, `/content/new`, `/content/$id` — list + editor (all fields, media picker, platform toggles, status workflow buttons with allowed transitions only).
  - `/media` — grid, upload, filters, source/rights badges, "used in" links.
  - `/products`, `/products/$id` — list + detail with new enums and badges.
  - `/campaigns`, `/campaigns/$id` — list + detail with related products/content.
  - `/publishing` — approved items, per-platform readiness checklist, "Export caption" copy button, save post URL (writes to `content_platforms.post_url` + `posted_at`, flips checklist booleans).
  - `/settings/meta` — placeholder fields + explanatory copy on future Graph API path (Edge Function / n8n).
  - `/settings/users` — admin only: approve pending users, assign/revoke roles, deactivate.

### Server functions
- All DB access via `createServerFn` + `requireSupabaseAuth`. `attachSupabaseAuth` registered in `src/start.ts`. Root `onAuthStateChange` invalidates router + query cache.
- `getSignedMediaUrl(path)` — 1h signed URL from private bucket.
- `uploadMedia` — client uploads via signed upload URL; metadata row inserted server-side.
- `updateContentStatus` — validates transitions per workflow above.
- `exportCaption(contentItemId, platform)` — returns assembled caption + hashtags + CTA for clipboard copy.
- `approveUser(userId, role)` — admin only.

### Components
- Status badge, platform badge, product-type badge, availability badge, usage-rights badge.
- Reusable filter bar.
- Calendar: `react-day-picker` month grid with event dots; list view fallback.
- shadcn primitives throughout.

### Out of scope (v1)
- No Meta Graph API, no OAuth, no tokens, no auto-posting, no webhooks.
- No real inventory/stock tracking — products are content-support records only.
- No comment/notification system beyond `notes`.

### Acceptance verification
After build I'll verify: signup → first user is admin and active → second user blocked until approved → create content item → upload media (with source/rights) → attach → set platforms → walk forward and backward through statuses → approve → schedule → mark posted with URL saved on `content_platforms` → export caption to clipboard → Meta settings page renders as placeholder only.
