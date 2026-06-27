import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, keepPreviousData } from "@tanstack/react-query";
import { z } from "zod";
import { listProducts, type ProductSort } from "@/lib/public-site.functions";
import { CatalogView, type CatalogFilterState } from "@/components/storefront/CatalogView";

// /shop — the canonical public catalog (supersedes the old /catalog, which now
// 301s here). Ported from design-system/reference/Catalog.tsx.txt → TanStack:
// react-router useParams/Link → file route + search params, Helmet → head() with
// ItemList + BreadcrumbList JSON-LD, the DS bundle → reused @/components/* +
// @/components/storefront. Loader (ensureQueryData) + useSuspenseQuery for SSR +
// cache, mirroring products.$slug.tsx. NO Review/AggregateRating (hard rule).
//
// Filters/sort/page live in the URL search so SSR + back/forward stay correct
// and the loader can prefetch the exact page. listProducts reads only the gated
// v_public_inventory view, so the empty state is expected until Lovable flips the
// public-media bucket + flags items website-ready.

const SITE = "https://thefishtank.com";

const TYPES = ["all", "coral", "fish", "invert"] as const;
const SORTS = ["featured", "price-asc", "price-desc", "newest"] as const;

const searchSchema = z.object({
  type: z.enum(TYPES).optional(),
  sale: z
    .union([z.literal("1"), z.boolean()])
    .optional()
    .transform((v) => v === "1" || v === true || undefined),
  sort: z.enum(SORTS).optional(),
  page: z.number().int().min(0).max(1000).optional(),
});

type ShopSearch = z.infer<typeof searchSchema>;

const TITLE = "Live Stock Catalog";
const BLURB =
  "Everything swimming and growing at the shop right now — photographed under reef lighting. What you see is what ships.";

const productsQuery = (deps: {
  type?: string;
  sale?: boolean;
  sort?: ProductSort;
  page?: number;
}) =>
  queryOptions({
    queryKey: ["public-products", deps],
    queryFn: () =>
      listProducts({
        data: {
          type:
            deps.type && deps.type !== "all"
              ? (deps.type as "coral" | "fish" | "invert")
              : undefined,
          hasCompareAt: deps.sale || undefined,
          sort: deps.sort,
          page: deps.page,
        },
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

export const Route = createFileRoute("/(public)/shop")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({
    type: search.type,
    sale: search.sale,
    sort: search.sort,
    page: search.page,
  }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(productsQuery(deps)),
  head: ({ loaderData }) => {
    const url = `${SITE}/shop`;
    const products = loaderData?.products ?? [];
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: TITLE,
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
        { "@type": "ListItem", position: 2, name: TITLE, item: url },
      ],
    };
    return {
      meta: [
        { title: `${TITLE} | The Fish Tank — Sandy, UT` },
        { name: "description", content: BLURB.slice(0, 155) },
        { property: "og:type", content: "website" },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: BLURB.slice(0, 155) },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(itemList) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumb) },
      ],
    };
  },
  component: ShopPage,
});

function ShopPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/shop" });

  const { data } = useSuspenseQuery(
    productsQuery({ type: search.type, sale: search.sale, sort: search.sort, page: search.page }),
  );

  const filters: CatalogFilterState = {
    type: search.type ?? "all",
    onSale: !!search.sale,
    sort: search.sort ?? "featured",
  };

  const onFilters = (next: Partial<CatalogFilterState>) =>
    nav({
      search: (prev: ShopSearch) => ({
        ...prev,
        type: "type" in next ? (next.type === "all" ? undefined : (next.type as any)) : prev.type,
        sale: "onSale" in next ? (next.onSale ? true : undefined) : prev.sale,
        sort: "sort" in next ? next.sort : prev.sort,
        page: undefined, // any filter change resets paging
      }),
    });

  const onPage = (page: number) =>
    nav({ search: (prev: ShopSearch) => ({ ...prev, page: page || undefined }) });

  return (
    <CatalogView
      title={TITLE}
      blurb={BLURB}
      crumb="Live Stock"
      products={data.products}
      total={data.total}
      page={search.page ?? 0}
      onPage={onPage}
      filters={filters}
      onFilters={onFilters}
    />
  );
}
