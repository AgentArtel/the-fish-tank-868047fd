# Integration Guide — wiring the website to Supabase (Lovable stack)

Your stack: **Claude Design** scopes the system → **Claude Code** builds the site locally →
push to **Lovable** (hosting + Supabase backend). Lovable apps are **Vite + React + TypeScript
+ Tailwind + shadcn/ui + Supabase** — a client-rendered SPA (React Router), **not** Next.js. So
there's no ISR/server components: data is fetched client-side and kept fresh with **TanStack
Query + Supabase Realtime**. The data layer (`data/client/tft-data.js`) is already
framework-agnostic and drops straight in.

## 0. Setup
```bash
npm i @supabase/supabase-js @tanstack/react-query
```
Lovable injects Supabase env vars (Vite exposes them as `import.meta.env.VITE_*`). Create the
client and inject it into the data layer once:
```ts
// src/lib/tft.ts
import { createClient } from "@supabase/supabase-js";
import { initTftData } from "@/data/client/tft-data";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,        // anon, read-only — safe in the browser
  { auth: { persistSession: false } }            // read models are v_public_* in the default `public` schema
);
initTftData(supabase);
```
The shipped migration exposes everything as `v_public_*` views (granted to anon); the data layer
queries those names. Set the storage base for image URLs:
```sql
alter database postgres set "app.storage_base"
  = 'https://<ref>.supabase.co/storage/v1/object/public';
```

## 1. Fetch + render a collection (client-side, cached)
```tsx
// src/pages/Collection.tsx
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getCollectionProducts } from "@/data/client/tft-data";
import { ProductCard } from "@/components/ds"; // this design system's bundle

export default function Collection() {
  const { slug } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["collection", slug],
    queryFn: () => getCollectionProducts(slug!),
  });
  if (isLoading) return <SkeletonGrid />;
  const { collection, products } = data!;
  return (
    <>
      <h1>{collection.title}</h1>
      <p>{collection.description}</p>
      <div className="grid">
        {products.map((p) => (
          <ProductCard key={p.id} image={p.images[0]?.url}
            name={p.name} scientificName={p.scientificName} price={p.price}
            compareAt={p.compareAtPrice}
            stock={p.availability === "sold" ? "sold" : "live"} />
        ))}
      </div>
    </>
  );
}
```

## 2. Auto-update as staff change inventory (Realtime, not webhooks)
In a SPA the live signal is a Supabase Realtime subscription that invalidates the query cache —
no revalidation endpoint needed. Enable Realtime on `inventory_items` in Supabase, then:
```tsx
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeStock } from "@/data/client/tft-data";

export function useLiveInventory() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = subscribeStock(() => {
      qc.invalidateQueries({ queryKey: ["collection"] });
      qc.invalidateQueries({ queryKey: ["product"] });
    });
    return () => { ch.unsubscribe(); };
  }, [qc]);
}
```
Edit a price or mark an item sold in the workspace → the view reflects it → the subscription
fires → React Query refetches → the card updates live. (Set a sane `staleTime`, e.g. 60s, so
normal navigation is instant and Realtime handles the live delta.)

## 3. NAP / hours from one source (local SEO)
```tsx
import { getStoreLocation, openStatus } from "@/data/client/tft-data";
const loc = await getStoreLocation("sandy");
openStatus(loc.hours);              // "Open today · till 8pm"
// header + footer + Visit Us read loc.address / loc.phone — never hard-code NAP.
```

## 4. SEO in a Vite SPA (this is the local-authority piece)
A client-rendered SPA needs help for crawlers. On Lovable:
- **Meta + JSON-LD per route** with `react-helmet-async` — title, description, and the
  `LocalBusiness`/`PetStore` block (built from `getStoreLocation()`; see
  `ui_kits/website/index.html` for the exact JSON-LD), plus `Product`+`Offer` on PDPs and
  `BreadcrumbList` on collections.
- **Prerendering / SSG** for the static, rankable routes (home, Visit Us, collections, PDPs) so
  crawlers get real HTML. If Lovable's build doesn't prerender, add `vite-plugin-prerender` (or
  a prerender step in CI) for those paths; keep cart/account client-only.
- **One canonical NAP** everywhere (from `site_settings`/`store_locations`) — the #1 local
  signal. Submit `sitemap.xml` + keep Google Business Profile identical.

## 5. Images
`PublicProduct.images[].url` is already an absolute Supabase Storage public URL (built by the
`storage_url()` SQL helper). Reference directly in `<img>`; add `loading="lazy"` and width/height.

---
**Contract test (CI):** validate sample API responses against `data/schemas/*.json` with `ajv`
so a backend change that breaks the website shape fails the build, not production.
