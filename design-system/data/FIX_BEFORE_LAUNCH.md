# FIX BEFORE LAUNCH — seeded / placeholder data register

Everything _italicized_ in `WEBSITE_BUILD_SPEC.md` traces back to here. Nothing in this list is a
blocker to **building** the site, but every item must be resolved before **going live**. Grouped
by owner.

## 🔴 Blockers — wrong/placeholder data that would mislead customers or hurt SEO

| # | Item | Where | Fix | Owner |
|---|------|-------|-----|-------|
| 1 | **Store location seeded as Phoenix, AZ** (serviceAreas + likely address/geo on `v_public_locations`) | `site_settings.data.serviceAreas`, `store_locations` row | Reseed to **Sandy, UT** + Salt Lake Valley service areas; verify address/geo/phone | Backend (Lovable) |
| 2 | **Article hero + author avatar images don't resolve** (`hero_media_id`/`avatar_media_id` are FKs, no path) | `v_public_articles`, `v_public_authors` | Project `hero_media_path` / `avatar_media_path` like `primary_media_path` | Backend (Lovable) |
| 3 | **Product photos are placeholder gradients** | `assets/placeholders/*`, all product cards | Real livestock photography via the "approve for website" → `public-media` flow | Store / Backend |
| 4 | **Brand fonts are substitutes** (Bricolage Grotesque / Plus Jakarta Sans / JetBrains Mono) | `tokens/fonts.css` | Confirm or supply official brand fonts | Owner |

## 🟡 Content — real data exists but is empty or sample

| # | Item | Fix | Owner |
|---|------|-----|-------|
| 5 | No blog posts / guides / events / FAQs yet | Author real content (guides = SEO priority) in the workspace app | Store staff |
| 6 | Collections are sample (Weekly Specials / New Arrivals / SPS) | Create real published collections | Store staff |
| 7 | PDP **reviews block is mock** (4.9 · 128 stars) | Wire to a real source or remove (do NOT inject Review JSON-LD) | Frontend |
| 8 | Home **stat numbers** (700+ items, 100% aquacultured, 5-day guarantee) | Confirm real figures or remove | Owner |
| 9 | Hero / marketing / Reef Rewards **copy** is placeholder | Final copy pass | Owner / Frontend |
| 10 | Sourcing labels (Aquacultured / Tank-Raised / …) on cards are illustrative | Drive from real data or drop | Frontend |

## 🟢 Technical — wire up before launch (frontend/ops)

| # | Item | Owner |
|---|------|-------|
| 11 | Set `site_settings.storage_base` (done) + verify image URLs resolve end-to-end | Frontend |
| 12 | `sitemap.xml`, `robots.txt`, canonical + OG per route | Frontend |
| 13 | Prerender/SSG indexable routes (SPA won't rank otherwise) | Frontend |
| 14 | Honor `getRedirects()` 301s in the router | Frontend |
| 15 | JSON-LD per route (LocalBusiness / Product / Article+Person / FAQPage / Event / Breadcrumb) | Frontend |
| 16 | Anon SELECT policies + `is_website_ready` recompute trigger on media changes | Backend |
| 17 | Off-site local authority — Google Business Profile, citations, reviews (`LOCAL_SEO_CHECKLIST.md`) | Owner / Store |

---
_Quick wins to unblock the most: #1 (reseed Sandy) and #2 (media paths) are small backend edits;
#3 (real photos) and #5 (guides) are the highest-impact content work._
