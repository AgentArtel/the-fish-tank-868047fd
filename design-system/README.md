# The Fish Tank — Design System

A brand & UI design system for **The Fish Tank**, a leading retailer of marine fish and
aquacultured corals in **Sandy, Utah** (Salt Lake Valley) — "Utah's Saltwater Fish & Coral
Store." This system powers the public-facing website: a live, photo-driven catalog of what's
swimming, growing, and crawling in the shop right now, plus the marketing surfaces around it,
all **data-driven from the workspace app's Supabase backend** (see `data/DATA_MODEL.md`).

> **Location (NAP — keep identical everywhere):** The Fish Tank · 8371 700 W, Sandy, UT 84070 ·
> (801) 887-7000 · Mon–Fri 11:30am–8pm, Sat 11am–6pm, Sun 11am–4pm.

> **Positioning:** premium but friendly local reef shop. Trustworthy, knowledgeable, and
> genuinely enthusiastic about healthy livestock. Warm and welcoming — not a sterile big-box
> pet store, not a hype-y e-commerce funnel.

---

## Source material

This system was reverse-engineered and extended from the brand's real assets and codebase.
You may not have access; links are recorded so you can dig deeper if you do.

- **Product codebase (GitHub):** [`AgentArtel/the-fish-tank-868047fd`](https://github.com/AgentArtel/the-fish-tank-868047fd)
  — a Vite + React + TanStack Router + Supabase app (shadcn/ui components). It's primarily the
  *internal operations workspace* (inventory, pricing approval, coral discovery), but contains
  the public `/catalog` route and the canonical color tokens (`src/styles.css`) this system is
  built on. Explore it to better understand data shapes (item types, stock states, tank/plug
  locations) and the real product vocabulary.
- **Brand artwork (uploads):** the blue-tang logo (electric-blue body, black markings, yellow
  tail) plus matching wave and coral-composition illustrations. All copied into `assets/`. The
  earlier copperband-badge mark has been retired in favor of this blue-tang logo.

### Font substitution — please confirm
The codebase ships **no custom fonts** (default system/Tailwind stack). This system substitutes
tasteful Google Fonts: **Bricolage Grotesque** (display), **Plus Jakarta Sans** (body),
**JetBrains Mono** (codes), and **Pacifico** (wordmark flourish only). **If The Fish Tank has
official brand fonts, send them over and we'll swap them in.**

---

## Brand foundations at a glance

| | |
|---|---|
| **Primary** | Electric blue `--brand-primary` `#0078ff` (tang body — the action color) |
| **Highlight** | Cyan `--brand-cyan` `#00c6ff` (the fish's bright edge — live/fresh cues) |
| **Accent** | Yellow `--brand-accent` `#fee800` (the tang tail — the one warm pop, used sparingly) |
| **Deep** | Royal blue `--brand-deep` (tang shadows — emphasis fills, dark UI accents) |
| **Darks** | Near-black navy `--surface-ocean` `#070f22` for hero/footer sections |
| **Neutrals** | Crisp cool white → navy ink (clean, aquatic — no warm tones) |
| **Logo** | Blue-tang mark — black-and-blue markings keep it legible on light *and* dark fields |

---

## CONTENT FUNDAMENTALS — how The Fish Tank writes

**Voice:** a knowledgeable local reef-keeper talking to a fellow hobbyist. Warm, plain-spoken,
quietly expert. Confident without hype.

- **Person:** Address the customer as **you**; the shop is **we / us**. ("We'll text you when
  it's ready." "What you see is what's in the tank.")
- **Casing:** Sentence case for almost everything — headings, buttons, nav. Reserve ALL-CAPS for
  tiny eyebrow/overline labels with wide tracking (e.g. `AQUARIUM LIVESTOCK & SUPPLIES`).
- **Tone:** Reassuring and specific. Lean on real differentiators — *acclimated in-store*,
  *photographed*, *plug-tagged*, *aquacultured*, *guaranteed healthy*, *the specimen you see is
  the one you take home*. Honesty is a feature ("Stock updates throughout the day").
- **Livestock literacy:** Use correct hobby vocabulary naturally — common **and** scientific
  names (italic), *frag / colony / head / polyp*, *SPS / LPS*, *reef-safe*, *CUC* (clean-up
  crew), *care level*, *tank-raised / aquacultured*. Scientific names are always italic.
- **Numbers & codes:** Money and measurements in mono (`$129.00`, `2.5"`). Tank/plug codes like
  `C-40100` are real operational identifiers — render in mono.
- **Length:** Short. Headlines are 2–6 words. Product blurbs are 1–2 sentences. Never pad.
- **Emoji:** **None.** The brand expresses warmth through imagery and color, not emoji.
- **Examples of on-brand copy:**
  - Hero: *"A healthier reef starts here."*
  - Sub: *"Hand-selected saltwater fish and aquacultured corals — acclimated in-store,
    photographed, and guaranteed healthy when you take them home."*
  - Empty state: *"No items match these filters. Try clearing a filter, or check back soon —
    new arrivals land weekly."*
  - Microcopy: *"Open today · till 8pm"*, *"Updated 4 minutes ago"*, *"Add to cart"*.

### LOCAL SEO & AUTHORITY (Sandy / Salt Lake Valley)
The website's job is to win **local search** for marine aquarium intent across the Wasatch
Front. Bake these in:
- **NAP consistency is rule #1.** Name / address / phone must be byte-identical on the site,
  Google Business Profile, and every directory. The site pulls NAP from one source
  (`site_settings` / `store_locations`) so it can never drift — never hard-code it per page.
- **Geo-anchored copy, naturally.** Lead with "Utah's saltwater fish & coral store," reference
  **Sandy**, the **Salt Lake Valley**, and **I-15**; name service areas (Salt Lake City, Draper,
  South Jordan, West Jordan, Midvale, Lehi, Murray, Cottonwood Heights) where it reads honestly
  — e.g. the Visit Us block. Don't keyword-stuff.
- **Structured data.** Ship `LocalBusiness`/`PetStore` JSON-LD (address, geo, hours, areaServed)
  — see `ui_kits/website/index.html`. Add `Product` + `Offer` JSON-LD on PDPs and
  `BreadcrumbList` on collections.
- **Authority surfaces to build (content):** a real **Visit Us** page (map, hours, parking,
  photos), **care guides** ("reef-keeping in Utah's hard water"), and a blog — these earn the
  topical authority that ranks a local shop above national e-com.
- **Trust signals everywhere:** arrival guarantee, local pickup, reviews, "family-owned in
  Sandy." Show the showroom — a physical store is a ranking + conversion advantage.

---

## VISUAL FOUNDATIONS

**Overall feel:** bright, clean aquarium light meets deep reef. Two moods in one system —
*crisp cool-white daylight* for browsing/content, *near-black navy* for hero, footer, and
dramatic moments. The blue-tang logo, wave motif, and electric-blue gradients are the recurring
heroes.

- **Color vibe:** Vivid, cool, and aquatic — built entirely from the blue-tang logo.
  **Electric blue `#0078ff` is the action color**; cyan `#00c6ff` is the bright "live/fresh"
  highlight; royal blue is the deep emphasis; and a single **yellow `#fee800`** (the tang's tail)
  is the only warm note — used sparingly for "New" ribbons and the occasional accent. There are
  **no coral/orange brand colors** — the palette stays blue + cyan + yellow + navy + white.
  Neutrals are crisp and faintly cool (white → navy ink). Darks are near-black navy, where the
  logo and brand art live. Status colors stay functional and distinct from the brand: green
  success, amber warning (deliberately separate from brand yellow), red danger, blue info.
- **Type:** Display set in Bricolage Grotesque, **extra-bold, tight tracking** for hero/headings
  — characterful and confident. Body in Plus Jakarta Sans, regular, generous line-height (1.5).
  Scientific names italic. Big size jumps between hero (64–84px) and body (16px) for drama.
- **Imagery:** Photography-forward — every product has a real square photo (a hard brand rule:
  *no item goes live without a photo*). Product photos sit in cards; brand illustrations
  (the blue-tang mark, wave, coral composition) sit on near-black navy fields, often with a soft
  blue radial glow behind them. Image color vibe: vivid, high-saturation, cool-marine, crisp on
  the cool-white UI around them. (The `assets/placeholders/` tiles are abstract underwater
  gradients standing in for real
  livestock photography — replace with real shots.)
- **Backgrounds:** Mostly crisp cool-white (`--surface-page`). Dark sections use the
  `--grad-ocean` radial (navy-blue at top → near-black). The **wave motif** (`wave-dark.png`)
  is used as a subtle full-width divider/flourish at low opacity. No noisy textures, no busy
  patterns. Gradients are reserved: `--grad-ocean` (dark sections), `--grad-brand` (royal →
  electric → cyan, for vivid feature/CTA bands), `--grad-aqua` and `--grad-yellow` (occasional
  accents). Keep it electric-blue and clean.
- **Corner radii:** Soft but not pill-everything. Cards `--radius-lg` (12px), buttons/badges
  `--radius-md` (8px), inputs `--radius-sm` (6px), hero panels `--radius-2xl` (24px). Pills
  (`--radius-full`) for chips, filter tabs, and status badges.
- **Cards:** Pure white, **hairline border + soft cool-tinted shadow** (`--ring-hairline` +
  `--shadow-sm`). Shadows are navy-black (hue ~254) to sit naturally on the cool neutrals. On
  hover, cards **lift 3px** and deepen to `--shadow-lg`; product photos **zoom to
  1.06** inside their frame. A dark `tone="ocean"` card variant exists for dark sections.
- **Elevation:** `--shadow-xs → xl` for UI; `--glow-blue / --glow-cyan / --glow-yellow` for
  emphasis (glows used behind logo art and on key CTAs, sparingly).
- **Borders:** 1px, `--border-default` (cool gray) on light; `--border-ocean` hairline on dark.
- **Buttons:** Solid **electric-blue primary** (white text), yellow (`gold`) and deep-royal
  (`ocean`) fills for emphasis, plus secondary/outline/ghost/link. Medium height 36px, large CTA
  44px (touch-friendly).
- **Hover states:** fills **darken** one step (`--brand-primary-hover`, etc.) and the element
  lifts 1px. Links underline. Nav items grow an electric-blue underline from the left.
- **Press / active:** darker still (`--brand-primary-press`); no aggressive shrink — keep it calm.
- **Focus:** 1px blue border + a soft 3px blue ring (`rgba(0,120,255,0.22)`). Always
  visible — accessibility matters for a public site.
- **Transparency & blur:** the sticky header is translucent cool-white with `backdrop-filter: blur`.
  Scrims (`--scrim-bottom`) protect white text over photos (category tiles). Used purposefully,
  not decoratively.
- **Motion:** calm and aquatic. `--ease-out` for most settles (220ms), `--ease-swim` (a gentle
  overshoot) for playful drifts. Fades + small translateY lifts; **no bounces, no infinite
  decorative loops.** Respect `prefers-reduced-motion`.
- **Layout:** centered, max-width `--container-xl` (1200px), `--gutter` 24px, generous
  `--section-y` (96px) vertical rhythm. 4-up product grids on desktop. 4px spacing grid.

---

## ICONOGRAPHY

- **System:** [**Lucide**](https://lucide.dev) — the icon set the product codebase already uses
  (`lucide-react`: `Fish`, `Search`, `X`, etc.). Clean, rounded, ~2px stroke. This matches the
  brand's friendly-but-precise tone.
- **How to use it here:** In standalone HTML (cards, UI kit) load Lucide from CDN
  (`https://unpkg.com/lucide@latest/dist/umd/lucide.min.js`), place `<i data-lucide="fish"></i>`,
  and call `lucide.createIcons()` after render. In React/JSX components, pass icons as
  `leftIcon` / `rightIcon` / children (ReactNode) so any icon library works.
- **Common glyphs:** `fish`, `waves`, `shell`, `flower-2` (coral), `search`, `map-pin`,
  `ruler`, `heart-pulse` (care), `shield-check` (guarantee/reef-safe), `bookmark` (hold),
  `message-circle`, `arrow-right`, `chevron-right`, plus `instagram` / `facebook` / `youtube`.
- **Stroke weight / fill:** default Lucide stroke (no filled icons). Keep icon color tied to
  text or brand-ocean; avoid multicolor icons — color comes from imagery, not icons.
- **Emoji:** never used as UI. **Unicode** is used only for the tiny select chevron (`▾`) and
  small dot/bullet separators (`·`).
- **No hand-drawn SVG mascots.** The fish/wave/coral illustrations are real raster brand assets
  in `assets/` — use those, don't redraw them.

---

## INDEX — what's in this system

**Root**
- `styles.css` — the single entry point consumers link (only `@import`s + base reset).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`.
- `data/` — **website data architecture**: `DATA_MODEL.md` (Supabase → website mapping & the
  curation gate), `schemas/*.json` (JSON Schema contracts for products, collections, store
  location, site settings), and `samples/*.json` (validating example payloads). Start here to
  wire the decoupled front-end to the workspace backend.
- `assets/` — brand art + product-photo placeholders (see below).
- `SKILL.md` — Agent-Skill manifest (for use in Claude Code).

**Assets** (`assets/`)
- `logo-fish.png` — **primary logo**, blue tang with black markings (transparent; works on light & dark).
- `logo-fish-white.png` — white-markings variant, for placing on bright-blue or busy fields.
- `fish-on-black.png` — the mark on a solid black field.
- `fish-wave-dark.png` — tang + wave composition on near-black navy.
- `fish-coral-wave.png` — tang + coral fan + wave composition (transparent).
- `wave-dark.png` — wave motif divider/flourish (on navy).
- `placeholders/reef-1…8.jpg` — **placeholder** abstract underwater tiles standing in for real
  livestock photography. **Replace with real product photos.**

**Foundation cards** (`guidelines/*.card.html`) — render in the Design System tab:
Brand (logo, mascot, gradients), Colors (brand, ocean, neutral, status), Type (display, body,
mono/script), Spacing (scale, radii, elevation).

**Components** (`components/`) — reusable React primitives, exposed on
`window.TheFishTankDesignSystem_a2acac`:
- `core/` — **Button**, **Badge**, **Card** (+ `CardHeader`).
- `forms/` — **Input**, **Select**.
- `catalog/` — **ProductCard** (the signature live-stock tile).
- Each has a `.d.ts` (props), `.prompt.md` (usage), and a `*.card.html` showcase.

**UI kit** (`ui_kits/website/`) — interactive marketing-website recreation:
`index.html` (home → catalog → product, click-through), `SiteChrome.jsx` (header/footer),
`Home.jsx`, `Catalog.jsx`, `Product.jsx`, `data.js` (sample catalog).

---

## Using the system

**Build & hosting stack:** the website is built **locally with Claude Code** and pushed to
**Lovable** (hosting + Supabase backend) — a **Vite + React + TypeScript + Tailwind + shadcn/ui
+ Supabase** SPA. **Claude Design** (this project) scopes the design system + data model.
Wire-up details are in `data/INTEGRATION.md`.

1. Link the global stylesheet: `<link rel="stylesheet" href="styles.css">`.
2. Reference design tokens (`var(--brand-primary)`, `var(--type-h2)`, `var(--space-6)`, …).
3. For components, load the compiled bundle `_ds_bundle.js` and read from
   `window.TheFishTankDesignSystem_a2acac` (see any `*.card.html` for the exact pattern).
4. Load Lucide for icons; use the brand assets in `assets/` — never redraw the logo or mascot.
