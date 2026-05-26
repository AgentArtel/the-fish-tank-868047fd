# The Fish Tank Branding Pass

Scope: visual/branding only. No schema, auth, RLS, workflow, or feature changes.

## 1. Asset setup

Copy uploaded logos into `/public/brand/` and reference via absolute paths (e.g. `/brand/fish-tank-logo-horizontal.png`):

- `/public/brand/fish-tank-logo-horizontal.png` — wordmark + mascot (login, signup, sidebar)
- `/public/brand/fish-tank-mascot-icon.png` — mascot only (favicon, sidebar collapsed, empty states, dashboard accent)
- `/public/brand/fish-tank-badge-logo.png` — circular black/gold badge (pending approval, dashboard welcome)
- `/public/favicon.png` + `/public/apple-touch-icon.png` — mascot-only, referenced from `__root.tsx` head

## 2. Theme tokens (`src/styles.css`)

Shift Cloud White accent from blue to warm orange/gold from the logo; keep white/charcoal/gray base:

- `--background`: off-white
- `--foreground`: deep charcoal (near-black)
- `--card`: white
- `--primary`: warm orange `oklch(~0.68 0.17 50)` / `--primary-foreground`: white
- `--accent`: soft warm tint, plus `--brand-gold` for gold highlights
- `--ring`: orange
- `--border` / `--input`: light gray
- `--sidebar`: very light off-white, `--sidebar-accent`: warm orange-tinted hover

Destructive stays red. Status badge colors unchanged unless they clash.

## 3. Components to update

**`src/components/brand-logo.tsx`** — small wrapper rendering `horizontal | badge | mascot` variants from `/brand/...` at given size. Used across pages.

**Login** (`src/routes/login.tsx`) — horizontal logo above card, subtitle "Internal Content Management System", white background, no decorative chrome.

**Signup** (`src/routes/signup.tsx`) — matching horizontal logo + subtitle; helper text "New accounts require admin approval before access."

**Pending approval** (`src/routes/pending-approval.tsx`) — badge logo centered; "Your account is pending approval." + "An admin needs to approve your account before you can access The Fish Tank CMS."

**Sidebar** (`src/routes/_app.tsx`) — replace 🐠 emoji with mascot icon + "The Fish Tank" / "CMS" stacked label. Compact height; existing nav layout intact.

**Dashboard** (`src/routes/_app/dashboard.tsx`) — branded welcome card at top: "The Fish Tank CMS" / "Manage content, media, products, campaigns, and publishing workflows." with subtle mascot on the right.

**Empty state component** (`src/components/empty-state.tsx`) — mascot icon + title + one-line helper + optional action slot. Wire into content list, media, products, campaigns when empty.

**Root head** (`src/routes/__root.tsx`) — add `<link rel="icon">` and `apple-touch-icon` entries; keep existing title/description meta.

## 4. Out of scope

No DB migrations, no auth/RLS changes, no workflow changes, no Meta work, no new features.

## Acceptance

Login/signup/pending pages branded; sidebar shows mascot + name; favicon visible in tab; dashboard has welcome card; empty lists render branded empty state; orange/gold accent replaces blue primary; existing functionality intact.
