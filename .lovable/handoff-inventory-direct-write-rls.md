# Handoff → Lovable: confirm RLS covers the client-side direct writes (inventory)

Tier-2 inventory review, item #12. A few inventory edits are written **straight from the browser**
with the `supabase` client instead of going through a `requireEditor` server fn. That's fine **iff**
RLS + the gate triggers enforce the same `is_active` + editor-role rules the server fns would. This
is a **verify-and-harden** ask — not a known hole. Please confirm (and tighten if any gap exists).

## The direct client writes (no server fn in the path)
- **`inventory_items` UPDATE**
  - `location_id` — stock list (`inventory.index.tsx` `setLocation`) and detail (`inventory.$id.tsx` `changeLocation`)
  - `notes`, `website_ready_later` — detail NotesCard
  - `needs_photo = false` — detail MediaSection, right after a media upload
- **`inventory_media` INSERT / UPDATE / DELETE** — detail MediaSection (add media, change `tag`, delete)
- (Reads are all `SELECT`; not a concern.)

## What I believe already protects them (please confirm)
From the migrations:
- `inv update editor` → `USING (can_edit_content(auth.uid()))`
- `invmedia insert editor` / `invmedia update editor` → `WITH CHECK / USING (can_edit_content(auth.uid()))`
- `invmedia delete admin` → `USING (has_role(auth.uid(),'admin'))`
- `can_edit_content` = `is_active_user(uid) AND (admin | creator | reviewer | manager)`
- The `inv_guard_gates` BEFORE INSERT/UPDATE trigger fires on **any** write (client or server fn), so
  the availability/photo/pricing gates still hold on these direct updates.

So on paper an **inactive** user or a **viewer/no-role** user can't write these, and the gates can't be
bypassed. We just want it confirmed at the DB level rather than assumed.

## Please verify
1. No authenticated user who is **inactive** (`profiles.is_active = false`) or has **no editor role**
   can UPDATE `inventory_items` (esp. `location_id`, `notes`, `website_ready_later`, `needs_photo`) or
   write `inventory_media`. (i.e. the policies above are the only ones in force — no broader policy.)
2. The **`anon`** role has no INSERT/UPDATE/DELETE grant on `inventory_items` / `inventory_media`.
3. The gate triggers (`inv_guard_gates`, photo-required, pricing-approval) do fire on client writes too.

If all three hold, **no change needed** and we keep these as RLS-enforced direct writes (no app refactor).
If anything is loose, please tighten the policy/grant in a migration. Reply either way and we'll mark
item #12 resolved.
