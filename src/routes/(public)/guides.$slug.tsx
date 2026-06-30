import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getArticleBySlug } from "@/lib/public-site.functions";
import {
  ArticleDetail,
  ArticleNotFound,
  articleJsonLd,
} from "@/components/storefront/ArticleDetail";

// /guides/$slug — care-guide detail. Shares the same data fn + detail component
// as /blog/$slug (articles are one table; the surface only changes the
// breadcrumb + canonical base). HowTo+Person JSON-LD for guide-kind articles.

const SITE = "https://thefishtank.com";

const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-article", slug],
    queryFn: () => getArticleBySlug({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/(public)/guides/$slug")({
  loader: async ({ context, params }) => {
    const article = await context.queryClient.ensureQueryData(articleQuery(params.slug));
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData }) => {
    const article = loaderData?.article;
    if (!article) return { meta: [{ title: "Not found — The Fish Tank" }] };
    const url = `${SITE}/guides/${article.slug}`;
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
  component: GuideArticlePage,
  notFoundComponent: () => <ArticleNotFound base="/guides" backLabel="Guides" />,
});

function GuideArticlePage() {
  const { slug } = Route.useParams();
  const { data: article } = useSuspenseQuery(articleQuery(slug));
  if (!article) return <ArticleNotFound base="/guides" backLabel="Guides" />;
  return <ArticleDetail article={article} base="/guides" backLabel="Guides" />;
}
