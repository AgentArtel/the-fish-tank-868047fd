import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getArticleBySlug } from "@/lib/public-site.functions";
import {
  ArticleDetail,
  ArticleNotFound,
  articleJsonLd,
} from "@/components/storefront/ArticleDetail";

// /blog/$slug — article detail. Mirrors products.$slug.tsx: loader
// (ensureQueryData) + useSuspenseQuery, head() with Article + Person JSON-LD +
// canonical + OG, notFound handling. Body rendered via react-markdown.

const SITE = "https://thefishtank.com";

const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-article", slug],
    queryFn: () => getArticleBySlug({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/(public)/blog/$slug")({
  loader: async ({ context, params }) => {
    const article = await context.queryClient.ensureQueryData(articleQuery(params.slug));
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData }) => {
    const article = loaderData?.article;
    if (!article) return { meta: [{ title: "Not found — The Fish Tank" }] };
    const url = `${SITE}/blog/${article.slug}`;
    const desc = (article.seoDescription ?? article.excerpt ?? article.title).slice(0, 155);
    const img = article.heroImage ?? undefined;
    return {
      meta: [
        { title: `${article.seoTitle ?? article.title} | The Fish Tank` },
        { name: "description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:title", content: article.title },
        { property: "og:description", content: desc },
        ...(img ? [{ property: "og:image", content: img }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(articleJsonLd(article, url)) }],
    };
  },
  component: BlogArticlePage,
  notFoundComponent: () => <ArticleNotFound base="/blog" backLabel="Blog" />,
});

function BlogArticlePage() {
  const { slug } = Route.useParams();
  const { data: article } = useSuspenseQuery(articleQuery(slug));
  if (!article) return <ArticleNotFound base="/blog" backLabel="Blog" />;
  return <ArticleDetail article={article} base="/blog" backLabel="Blog" />;
}
