import { createFileRoute, useNavigate, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, keepPreviousData } from "@tanstack/react-query";
import { z } from "zod";
import { SearchX } from "lucide-react";
import { getCollectionProducts, getSiteSettings, pickupEtaLine } from "@/lib/public-site.functions";
import { CatalogView } from "@/components/storefront/CatalogView";

// /collections/$slug — collection-scoped catalog. Same CatalogView as /shop, but
// the collection's own `filter` (from v_public_collections) governs the result
// set, so the filter sidebar is hidden. Ported from Catalog.tsx.txt: Helmet →
// head() with ItemList + BreadcrumbList JSON-LD; unknown/unpublished slug →
// notFound(). Loader (ensureQueryData) + useSuspenseQuery, mirroring the PDP.
// NO Review/AggregateRating (hard rule).

const SITE = "https://thefishtank.com";

const searchSchema = z.object({
  page: z.number().int().min(0).max(1000).optional(),
});
type CollectionSearch = z.infer<typeof searchSchema>;

const collectionQuery = (slug: string, page?: number) =>
  queryOptions({
    queryKey: ["public-collection", slug, page ?? 0],
    queryFn: () => getCollectionProducts({ data: { slug, page } }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

const siteSettingsQuery = queryOptions({
  queryKey: ["public-site-settings"],
  queryFn: () => getSiteSettings(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/(public)/collections/$slug")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ context, params, deps }) => {
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData(collectionQuery(params.slug, deps.page)),
      context.queryClient.ensureQueryData(siteSettingsQuery),
    ]);
    if (!data.collection) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const collection = loaderData?.collection;
    if (!collection) return { meta: [{ title: "Not found — The Fish Tank" }] };

    const url = `${SITE}/collections/${collection.slug}`;
    const products = loaderData?.products ?? [];
    const blurb =
      collection.description ?? `${collection.title} — live stock at The Fish Tank, Sandy UT.`;
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: collection.title,
      itemListElement: products.slice(0, 24).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/products/${p.slug}`,
        name: p.name,
      })),
    };
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE },
        { "@type": "ListItem", position: 2, name: "Collections", item: `${SITE}/shop` },
        { "@type": "ListItem", position: 3, name: collection.title, item: url },
      ],
    };
    return {
      meta: [
        { title: `${collection.title} | The Fish Tank — Sandy, UT` },
        { name: "description", content: blurb.slice(0, 155) },
        { property: "og:type", content: "website" },
        { property: "og:title", content: collection.title },
        { property: "og:description", content: blurb.slice(0, 155) },
        ...(collection.heroImage ? [{ property: "og:image", content: collection.heroImage }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(itemList) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumb) },
      ],
    };
  },
  component: CollectionPage,
  notFoundComponent: CollectionNotFound,
});

function CollectionPage() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const nav = useNavigate({ from: "/collections/$slug" });

  const { data } = useSuspenseQuery(collectionQuery(slug, page));
  const { data: settings } = useSuspenseQuery(siteSettingsQuery);
  if (!data.collection) return <CollectionNotFound />;

  const etaLine = pickupEtaLine(settings.orderCycle);

  const blurb =
    data.collection.description ??
    "Hand-picked live stock from The Fish Tank — photographed under reef lighting.";

  const onPage = (next: number) =>
    nav({ search: (prev: CollectionSearch) => ({ ...prev, page: next || undefined }) });

  return (
    <CatalogView
      title={data.collection.title}
      blurb={blurb}
      crumb={data.collection.title}
      products={data.products}
      total={data.total}
      page={page ?? 0}
      onPage={onPage}
      etaLine={etaLine}
    />
  );
}

function CollectionNotFound() {
  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "var(--space-24) var(--gutter)",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", color: "var(--text-muted)" }}>
        <SearchX size={40} />
      </div>
      <h1
        style={{
          font: "var(--fw-extra) var(--text-3xl)/1.1 var(--font-display)",
          marginTop: "var(--space-4)",
        }}
      >
        We couldn't find that collection
      </h1>
      <p
        style={{
          font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
          color: "var(--text-secondary)",
          marginTop: "var(--space-3)",
        }}
      >
        It may have been unpublished. Browse everything that's swimming right now.
      </p>
      <Link
        to="/shop"
        style={{
          display: "inline-block",
          marginTop: "var(--space-6)",
          height: "var(--control-lg)",
          lineHeight: "var(--control-lg)",
          padding: "0 22px",
          borderRadius: "var(--radius-md)",
          background: "var(--brand-primary)",
          color: "var(--text-on-brand)",
          textDecoration: "none",
          boxShadow: "var(--glow-blue)",
          font: "var(--fw-bold) var(--text-base)/var(--control-lg) var(--font-sans)",
        }}
      >
        Browse live stock
      </Link>
    </div>
  );
}
