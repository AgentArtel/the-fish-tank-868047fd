import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listArticles } from "@/lib/public-site.functions";
import { ArticleList } from "@/components/storefront/ArticleList";

// /blog — published articles on the "blog" surface (kind ∈ news, event_recap,
// species_spotlight, other). Ported from design-system/reference/ArticleList.tsx.txt
// → TanStack: react-router→file route, Helmet→head() (canonical + OG +
// Breadcrumb JSON-LD), DS primitives→storefront components. Loader
// (ensureQueryData) + useSuspenseQuery for SSR+cache, mirroring shop.tsx.
// Empty state is expected until Lovable seeds + publishes articles.

const SITE = "https://thefishtank.com";
const TITLE = "The Fish Tank Blog";
const BLURB =
  "New arrivals, livestock highlights, events, and reef news from our Sandy showroom.";

const blogQuery = queryOptions({
  queryKey: ["public-articles", "blog"],
  queryFn: () => listArticles({ data: { surface: "blog" } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/(public)/blog")({
  loader: ({ context }) => context.queryClient.ensureQueryData(blogQuery),
  head: () => {
    const url = `${SITE}/blog`;
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE },
        { "@type": "ListItem", position: 2, name: "Blog", item: url },
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
  component: BlogPage,
});

function BlogPage() {
  const { data } = useSuspenseQuery(blogQuery);
  return (
    <ArticleList surface="blog" title={TITLE} blurb={BLURB} articles={data.articles} />
  );
}
