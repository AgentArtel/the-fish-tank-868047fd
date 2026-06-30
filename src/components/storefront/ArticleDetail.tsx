import { Link } from "@tanstack/react-router";
import { ChevronRight, SearchX } from "lucide-react";
import { Markdown } from "@/components/storefront/Markdown";
import type { ArticleDetail as ArticleDetailData } from "@/lib/public-site.functions";

// Ported from design-system/reference/ArticleDetail.tsx.txt → TanStack/TSX.
// Shared by /blog/$slug and /guides/$slug (the only difference is the breadcrumb
// label + back-link base, passed via props). Renders the markdown body with the
// storefront <Markdown> component (react-markdown — no dangerouslySetInnerHTML),
// the author byline (E-E-A-T), and any pinned featured products as cross-links
// to the PDP. Inline `var(--...)` token styles matching the PDP idiom.

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";

const formatPrice = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));

export function ArticleDetail({
  article,
  base,
  backLabel,
}: {
  article: ArticleDetailData;
  base: "/blog" | "/guides";
  backLabel: string;
}) {
  return (
    <article style={{ maxWidth: 760, margin: "0 auto", padding: "var(--space-10) var(--gutter) 0" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
          color: "var(--text-muted)",
          marginBottom: "var(--space-5)",
        }}
      >
        <Link to="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
          Home
        </Link>
        <ChevronRight size={14} />
        <Link to={base} style={{ color: "var(--text-muted)", textDecoration: "none" }}>
          {backLabel}
        </Link>
      </nav>

      {!!article.tags.length && (
        <div
          style={{
            font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--brand-primary)",
            marginBottom: 10,
          }}
        >
          {article.tags[0]}
        </div>
      )}
      <h1 style={{ font: "var(--fw-extra) var(--text-4xl)/1.05 var(--font-display)", margin: 0 }}>
        {article.title}
      </h1>
      {article.subtitle && (
        <p
          style={{
            font: "var(--fw-regular) var(--text-xl)/1.4 var(--font-sans)",
            color: "var(--text-muted)",
            marginTop: "var(--space-3)",
          }}
        >
          {article.subtitle}
        </p>
      )}

      {/* byline — E-E-A-T. avatarUrl is currently null (no projected path); we
          render initials in a token-styled chip so the byline still reads. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          margin: "var(--space-5) 0 var(--space-6)",
        }}
      >
        {article.author?.avatarUrl ? (
          <img
            src={article.author.avatarUrl}
            alt={article.author.name}
            style={{ width: 44, height: 44, borderRadius: "var(--radius-full)", objectFit: "cover" }}
          />
        ) : article.author ? (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-full)",
              background: "var(--blue-50)",
              color: "var(--brand-primary)",
              display: "grid",
              placeItems: "center",
              font: "var(--fw-bold) var(--text-base)/1 var(--font-sans)",
              flex: "none",
            }}
          >
            {article.author.name.slice(0, 1).toUpperCase()}
          </div>
        ) : null}
        <div>
          {article.author?.name && (
            <div
              style={{
                font: "var(--fw-semibold) var(--text-sm)/1.2 var(--font-sans)",
                color: "var(--text-heading)",
              }}
            >
              {article.author.name}
            </div>
          )}
          <div
            style={{
              font: "var(--fw-regular) var(--text-xs)/1.4 var(--font-sans)",
              color: "var(--text-muted)",
            }}
          >
            {article.author?.credentials && <span>{article.author.credentials} · </span>}
            {fmtDate(article.publishedAt)}
          </div>
        </div>
      </div>

      {article.heroImage && (
        <img
          src={article.heroImage}
          alt={article.title}
          style={{
            width: "100%",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-md)",
            marginBottom: "var(--space-8)",
          }}
        />
      )}

      {/* body */}
      <div>
        <Markdown>{article.bodyMarkdown}</Markdown>
      </div>

      {/* featured products — cross-link to the catalog (PDP) */}
      {!!article.featuredProducts.length && (
        <section style={{ margin: "var(--space-16) 0" }}>
          <h2
            style={{
              font: "var(--fw-bold) var(--text-2xl)/1.2 var(--font-display)",
              color: "var(--text-heading)",
              marginBottom: "var(--space-6)",
            }}
          >
            Featured in this post
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "var(--space-5)",
            }}
          >
            {article.featuredProducts.map((p) => (
              <Link
                key={p.id}
                to="/products/$slug"
                params={{ slug: p.slug }}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    background: "var(--surface-card)",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    boxShadow: "var(--ring-hairline), var(--shadow-sm)",
                  }}
                >
                  <div
                    style={{
                      aspectRatio: "1/1",
                      background: "var(--surface-sunken)",
                      overflow: "hidden",
                    }}
                  >
                    {p.images[0]?.url && (
                      <img
                        src={p.images[0].url}
                        alt={p.name}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                  <div style={{ padding: "var(--space-3)" }}>
                    <div
                      style={{
                        font: "var(--fw-semibold) var(--text-sm)/1.3 var(--font-sans)",
                        color: "var(--text-heading)",
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)",
                        color: "var(--brand-primary)",
                        marginTop: 4,
                      }}
                    >
                      {formatPrice(p.price)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

export function ArticleNotFound({
  base,
  backLabel,
}: {
  base: "/blog" | "/guides";
  backLabel: string;
}) {
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
        Article not found
      </h1>
      <p
        style={{
          font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
          color: "var(--text-secondary)",
          marginTop: "var(--space-3)",
        }}
      >
        It may have moved or been unpublished.
      </p>
      <Link
        to={base}
        style={{
          display: "inline-block",
          marginTop: "var(--space-6)",
          color: "var(--brand-primary)",
          font: "var(--fw-semibold) var(--text-base)/1 var(--font-sans)",
        }}
      >
        Back to all {backLabel.toLowerCase()}
      </Link>
    </div>
  );
}

/** Shared Article + Person JSON-LD for a post detail (used in both route head()s). */
export function articleJsonLd(article: ArticleDetailData, url: string) {
  const img = article.heroImage ?? undefined;
  return {
    "@context": "https://schema.org",
    "@type": article.surface === "guide" ? "HowTo" : "Article",
    headline: article.title,
    description: article.seoDescription ?? article.excerpt ?? undefined,
    image: img ? [img] : undefined,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
    author: article.author
      ? {
          "@type": "Person",
          name: article.author.name,
          jobTitle: article.author.credentials ?? undefined,
        }
      : { "@type": "Organization", name: "The Fish Tank" },
    publisher: {
      "@type": "Organization",
      name: "The Fish Tank",
      logo: {
        "@type": "ImageObject",
        url: "https://thefishtank.com/storefront/logo-fish.png",
      },
    },
    mainEntityOfPage: url,
  };
}
