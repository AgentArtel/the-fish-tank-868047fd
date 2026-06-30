import { Link } from "@tanstack/react-router";
import { Feather } from "lucide-react";
import type { Article } from "@/lib/public-site.functions";

// Ported from design-system/reference/ArticleList.tsx.txt → TanStack/TSX.
// One component for both /blog and /guides (the surface differs only in the
// header copy + detail link base). Inline `var(--...)` token styles matching the
// PDP/Catalog idiom. Graceful empty state: nothing seeded yet is EXPECTED.

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";

export function ArticleList({
  surface,
  title,
  blurb,
  articles,
}: {
  surface: "blog" | "guide";
  title: string;
  blurb: string;
  articles: Article[];
}) {
  const base = surface === "guide" ? "/guides" : "/blog";

  return (
    <div>
      <section style={{ background: "var(--grad-ocean)", color: "var(--text-on-ocean)" }}>
        <div
          style={{
            maxWidth: "var(--container-xl)",
            margin: "0 auto",
            padding: "var(--space-14) var(--gutter)",
          }}
        >
          <h1
            style={{
              font: "var(--fw-extra) var(--text-5xl)/1 var(--font-display)",
              color: "#fff",
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
              marginTop: "var(--space-3)",
              maxWidth: 580,
            }}
          >
            {blurb}
          </p>
        </div>
      </section>

      <section
        style={{
          maxWidth: "var(--container-xl)",
          margin: "0 auto",
          padding: "var(--space-12) var(--gutter)",
        }}
      >
        {articles.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "var(--space-20)",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Feather size={40} />
            </div>
            <div
              style={{
                font: "var(--fw-bold) var(--text-xl)/1.2 var(--font-display)",
                color: "var(--text-heading)",
                marginTop: 12,
              }}
            >
              Fresh {surface === "guide" ? "guides" : "posts"} coming soon
            </div>
            <p style={{ font: "var(--fw-regular) var(--text-sm)/1.5 var(--font-sans)", marginTop: 6 }}>
              Check back shortly — our reef team is writing.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "var(--space-6)",
            }}
          >
            {articles.map((a) => (
              <Link
                key={a.id}
                to={`${base}/$slug`}
                params={{ slug: a.slug }}
                style={{ textDecoration: "none" }}
              >
                <ArticleCard article={a} fmtDate={fmtDate} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ArticleCard({
  article: a,
  fmtDate,
}: {
  article: Article;
  fmtDate: (d: string | null) => string;
}) {
  return (
    <article
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: "var(--ring-hairline), var(--shadow-sm)",
        height: "100%",
      }}
    >
      <div style={{ aspectRatio: "16/10", background: "var(--surface-sunken)", overflow: "hidden" }}>
        {a.heroImage && (
          <img
            src={a.heroImage}
            alt={a.title}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
      <div style={{ padding: "var(--space-5)" }}>
        {!!a.tags.length && (
          <div
            style={{
              font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              color: "var(--brand-primary)",
              marginBottom: 8,
            }}
          >
            {a.tags[0]}
          </div>
        )}
        <h2
          style={{
            font: "var(--fw-bold) var(--text-xl)/1.2 var(--font-display)",
            color: "var(--text-heading)",
            margin: 0,
          }}
        >
          {a.title}
        </h2>
        {a.excerpt && (
          <p
            style={{
              font: "var(--fw-regular) var(--text-sm)/1.5 var(--font-sans)",
              color: "var(--text-secondary)",
              marginTop: 8,
            }}
          >
            {a.excerpt}
          </p>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            marginTop: "var(--space-4)",
            font: "var(--fw-regular) var(--text-xs)/1 var(--font-sans)",
            color: "var(--text-muted)",
          }}
        >
          {a.author?.name && <span>{a.author.name}</span>}
          {a.publishedAt && <span>· {fmtDate(a.publishedAt)}</span>}
        </div>
      </div>
    </article>
  );
}
