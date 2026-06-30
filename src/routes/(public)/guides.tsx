import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listArticles } from "@/lib/public-site.functions";
import { ArticleList } from "@/components/storefront/ArticleList";

// /guides — published articles on the "guide" surface (kind ∈ care_guide, how_to).
// Reuses the same ArticleList component as /blog; the detail link base differs
// only via the `surface` prop. Loader + useSuspenseQuery for SSR+cache.
// Empty state is expected until Lovable seeds + publishes care guides.

const SITE = "https://thefishtank.com";
const TITLE = "Reef Care Guides";
const BLURB =
  "Practical, Utah-tested guides from our reef team — acclimation, water chemistry, livestock care, and tank setup.";

const guidesQuery = queryOptions({
  queryKey: ["public-articles", "guide"],
  queryFn: () => listArticles({ data: { surface: "guide" } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/(public)/guides")({
  loader: ({ context }) => context.queryClient.ensureQueryData(guidesQuery),
  head: () => {
    const url = `${SITE}/guides`;
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE },
        { "@type": "ListItem", position: 2, name: "Guides", item: url },
      ],
    };
    return {
      meta: [
        { title: `${TITLE} | The Fish Tank — Sandy, UT` },
        { name: "description", content: BLURB },
        { property: "og:type", content: "website" },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: BLURB },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(breadcrumb) }],
    };
  },
  component: GuidesPage,
});

function GuidesPage() {
  const { data } = useSuspenseQuery(guidesQuery);
  return (
    <ArticleList surface="guide" title={TITLE} blurb={BLURB} articles={data.articles} />
  );
}
