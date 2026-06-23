# Design — Public website design system (compete with the premium players)

Date: 2026-06-23 · Author: Claude Code (design/scoping — no app code changed).
Status: **Phase 4 design direction.** Companion: `research-public-website-competitors.md`,
`scope-public-website.md`. Stack: TanStack Start + **Tailwind v4** + **shadcn/Radix** (already in
`src/`), so this maps to CSS variables + Tailwind tokens, not a new framework.

> **North star:** the category's premium signal is **honest macro WYSIWYG photography on a dark,
> low-chroma canvas so the coral is the only saturated thing on the page.** Win on photography +
> WYSIWYG discipline + a crisp guarantee first; chrome second (per the Reef2Reef community verdict
> that reputation/photography beat site polish). This is a decoupled public theme — it does **not**
> have to match the internal ops app's look.

---

## 1. Design principles (category-specific, not generic)

1. **Dark canvas, coral as the only color.** Near-black/charcoal background continuous with the
   blue-lit, dark-tank product photography, so photos "bleed" into the page instead of sitting in
   white cards. This is the single biggest premium differentiator in the niche.
2. **Photography is the product.** Big, image-forward grids; let macro shots carry the page.
   Chrome (borders, buttons) stays minimal and low-chroma so it never competes with the coral.
3. **WYSIWYG honesty.** Where stock is one-of-one, show it *and label it*; offer **both blue/actinic
   and white-light** imagery (or video) — the community actively distrusts actinic-only,
   saturation-boosted photos. Honesty is a design feature.
4. **Restraint = premium.** One warm CTA color, one cool interactive/hover color, generous dark
   whitespace, clean sans-serif. Amateur tells we avoid: white default theme, inconsistent
   phone-shot images, cluttered category pages without grid discipline/breadcrumbs.
5. **Accessibility on dark.** Dark UI must still hit WCAG AA for text/controls — reserve the bright
   coral accent for CTAs and never rely on it alone to convey state.

---

## 2. Color tokens

Define as CSS variables (`oklch`/hsl) wired into Tailwind v4 `@theme`. Values below are a **starting
palette to refine against a manual visual audit of WWC/Vivid/Tidal Gardens** — treat as direction,
not final hex.

| Token | Role | Suggested value | Notes |
|---|---|---|---|
| `--bg` | Page background | `#0B0E12` (inky charcoal) | Near-black, slight blue cast to match actinic photography |
| `--surface` | Cards / nav | `#12161C` | One step up from bg; very low chroma |
| `--surface-2` | Hover/raised | `#1A2029` | |
| `--border` | Hairlines | `#262E38` | Subtle; never white |
| `--text` | Primary text | `#E8EDF2` | Off-white, not pure white |
| `--text-muted` | Secondary | `#9AA7B4` | Care labels, captions |
| `--accent` | **CTA / price / "Add"** | `#FF6A3D` (neon coral) | The one warm pop; buttons, sale price, live badge |
| `--accent-2` | Interactive / hover / links | `#27C2D6` (electric cyan) | Hover states, focus rings, filter chips |
| `--success` | Available / in-stock | `#39D98A` | |
| `--warn` | On-hold / low-stock | `#F5B544` | |
| `--danger` | Sold-out / DOA | `#F0506E` | |

Keep a **single light surface** only if a "Learn/Care Guide" reading view wants long-form legibility
— but default everything else dark. Map these to shadcn's semantic tokens (`--background`,
`--card`, `--primary`, `--ring`, etc.) so existing shadcn components inherit the theme automatically.

---

## 3. Typography

- **Sans-serif system, two roles:** a clean geometric/grotesque for UI + headings (e.g. *Inter*,
  *Geist*, or *Satoshi*), and the same family for body. Keep it to **one font family, 2–3 weights** —
  the category leaders are image-forward, not type-forward.
- **Scale (fluid, `clamp()`):** Display `clamp(2.25rem, 5vw, 4rem)` for hero; H1 ~2rem; H2 ~1.5rem;
  body 1rem/1.6; care-label/caption 0.8125rem uppercase tracking-wide for the "Quick Stats" rows.
- **Numerics:** tabular figures for prices/PAR/size so catalog cards align.
- **Italic** reserved for scientific names (matches the existing catalog card convention in
  `src/routes/catalog.tsx`).

---

## 4. Spacing, grid & motion

- **Spacing scale:** Tailwind default 4px base; section padding `py-16`→`py-24` on desktop for an
  airy premium feel; tight `gap-3/gap-4` inside catalog grids.
- **Catalog grid:** 2 cols mobile → 3 sm → 4 lg (matches the existing public catalog grid — reuse
  it). Square `aspect-square` image top, info below. Hover: subtle `scale-105` image zoom + shadow
  (already present in `CatalogCard`).
- **Motion:** restrained. Image zoom on hover, fade-in on scroll for sections, a pulse on the LIVE
  badge during a drop. No parallax gimmicks. Respect `prefers-reduced-motion`.

---

## 5. Component inventory (reuse shadcn; new public-only pieces)

**Reuse as-is from `src/components/ui/`:** `Button`, `Badge`, `Input`, `Select`, `Card`,
`Accordion` (FAQ/care), `Carousel` (embla — hero/gallery), `Dialog`/`Sheet` (quick-view, mobile
nav), `Tabs`, `Tooltip`, `Skeleton`.

**New public marketing blocks (theme variants, not new primitives):**

| Component | Purpose | Built from |
|---|---|---|
| `SiteHeader` / `SiteFooter` | Public nav (Livestock, Learn, Live Sales, Services, About, Visit) + trust footer (guarantee/shipping/socials) | `NavigationMenu`, `Sheet` |
| `Hero` | Full-bleed dark hero, macro coral image/video, one accent CTA | `Carousel` + utility |
| `LivestockCard` | Catalog card — **extend existing `CatalogCard`**: add WYSIWYG badge, availability pill, care-icon row, sold-out overlay | existing card + `Badge` |
| `CareStats` | LiveAquaria-style "Quick Stats" row (lighting/flow/placement/care-level icons) from `attrs` | `lucide-react` icons + grid |
| `WysiwygBadge` | "Exact specimen" label + blue/white-light toggle on the gallery | `Badge`, `Tabs` |
| `CareGuideArticle` | Long-form reading view for the SEO library | prose styles |
| `GuaranteeBar` / `TrustStrip` | Site-wide Arrive-Alive + overnight-shipping + DOA-window strip | utility |
| `LiveSaleBanner` / `DropCard` / `AuctionCard` | Phase 4+ live-sale/auction surfaces (countdown, LIVE badge, bid history) | `Badge`, timers |
| `AccountMenu` / `WishlistButton` | Phase 4 accounts | `DropdownMenu`, `Button` |

**Iconography:** `lucide-react` (already a dependency) for care stats — sun (lighting), wind/waves
(flow), layers (placement), gauge (care level), shield (reef-safe).

---

## 6. The catalog card — concrete spec (extends what exists)

Today's `CatalogCard` (`src/routes/catalog.tsx:192`) shows image, name, scientific name, price,
type badge, size/location. Premium-competitive additions, all from existing data:

```
┌─────────────────────────┐
│  [WYSIWYG]      [● Avail] │  ← badges over image (top-left tier, top-right availability)
│      macro photo         │
│                          │
├─────────────────────────┤
│ Rainbow Hammer Coral     │  name
│ Euphyllia ancora         │  scientific (italic, muted)
│ ☀ High  ≈ Med  ▦ Any     │  CareStats row (coral attrs: lighting/flow/placement)
│ $129.99        [Coral]   │  accent price + type badge
│ 2" frag · System 1       │  size · location
└─────────────────────────┘
```

Sold-out → grayscale image + "SOLD" overlay (don't hide; one-of-one sell-outs are social proof).

---

## 7. Implementation notes

- **Theme isolation:** ship the public theme as its own token set (e.g. a `data-theme="public"`
  scope or a separate route-group layout) so it never bleeds into the internal ops app. The public
  site is decoupled by intent (see `scope-public-website.md` §architecture).
- **Tailwind v4:** declare tokens in `@theme` in the public layout's CSS; reuse `tailwind-merge` +
  `class-variance-authority` already present for variant management.
- **Photography pipeline is the real work, not CSS.** The design only looks premium if the source
  images are good. The internal `inventory_media.tag = 'website'` lane + the photo-on-file
  invariant already enforce "no available item without a photo" — the public site should **prefer
  `website`-tagged media** and surface blue+white-light variants where present (see
  `scope-public-website-data-schemas.md`).
- **Dark-mode-only first.** Don't build a light theme in v1; the category is dark. A light reading
  theme for Care Guides can come later.

---

## 8. Open questions for the owner

1. **Brand colors/logo:** do we have an existing Fish Tank brand palette/logo to anchor `--accent`,
   or should the neon-coral/cyan direction above become the brand? (Affects everything.)
2. **Font licensing:** OK to use a free font (Inter/Geist) or do we want a licensed display face?
3. **Dark-only** confirmed for v1, or do you want a light Care-Guides reading mode from the start?
4. **Visual audit:** want me to do a manual browser pass on 3–4 leaders (WWC, Tidal Gardens, Vivid,
   Top Shelf) to capture exact palettes/type before we lock tokens? (Their sites 403-block automated
   fetch, so this needs a real browser session.)
</content>
