---
name: the-fish-tank-design
description: Use this skill to generate well-branded interfaces and assets for The Fish Tank (a marine fish & coral retail shop in northern Utah), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference
- **Stack:** built locally with Claude Code → pushed to Lovable (hosting + Supabase). Lovable = Vite + React + TypeScript + Tailwind + shadcn/ui + Supabase (client-rendered SPA). Data is fetched client-side via `data/client/tft-data.js` + TanStack Query, kept live with Supabase Realtime. See `data/DATA_MODEL.md` + `data/INTEGRATION.md`.
- **Brand:** The Fish Tank — "Utah's Saltwater Fish & Coral Store", **Sandy, UT** (8371 700 W, Sandy, UT 84070 · (801) 887-7000). Premium-but-friendly local reef shop; live photo-driven catalog, data-driven from the workspace Supabase backend.
- **Tokens:** link `styles.css`; use `var(--brand-primary)` (electric blue #0078ff), `var(--brand-cyan)` (cyan highlight), `var(--brand-accent)` (yellow tail), `var(--brand-deep)` (royal blue), `--surface-page` (cool white), `--surface-ocean` (near-black navy), type roles `var(--type-h1…)`, spacing `var(--space-*)`.
- **Fonts:** Bricolage Grotesque (display), Plus Jakarta Sans (body), JetBrains Mono (codes). SUBSTITUTIONS — confirm with the user if official fonts exist.
- **Icons:** Lucide (`<i data-lucide="fish">` + `lucide.createIcons()`). No emoji.
- **Components:** load `_ds_bundle.js`, read `window.TheFishTankDesignSystem_a2acac` → `Button`, `Badge`, `Card`, `CardHeader`, `Input`, `Select`, `ProductCard`.
- **Assets:** `assets/logo-fish.png` (primary blue-tang logo), `assets/logo-fish-white.png`, `assets/wave-dark.png`, `assets/fish-coral-wave.png`. Never redraw or recolor the logo. `assets/placeholders/` are stand-ins for real livestock photos.
- **Voice:** address customer as "you", shop as "we"; sentence case; correct hobby vocabulary (frag/colony/SPS/LPS/reef-safe/aquacultured); scientific names italic; no emoji; short copy.
