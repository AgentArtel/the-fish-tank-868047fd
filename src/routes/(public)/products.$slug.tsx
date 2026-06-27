import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Heart,
  ShoppingCart,
  ShieldCheck,
  HeartPulse,
  Ruler,
  MapPin,
  ChevronRight,
  SearchX,
} from "lucide-react";
import { getProductBySlug, type Product } from "@/lib/public-site.functions";

// PDP — ported from design-system/reference/ProductDetail.tsx.txt.
// react-router → TanStack (Route.useParams, @tanstack/react-router Link),
// react-helmet → head() with Product + Offer JSON-LD, data-lucide → lucide-react.
// Loader (ensureQueryData) + useSuspenseQuery for SSR + cache. Sold-out and
// not-found states preserved. Images resolve from primary_media_path +
// storage_base server-side; a local placeholder covers empty public-media.

const PLACEHOLDER = "/storefront/fish-on-black.png";
const SITE = "https://thefishtank.com";

const formatPrice = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));

const pctOff = (p: Product) =>
  p.compareAtPrice && p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0;

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/(public)/products/$slug")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product;
    if (!product) {
      return { meta: [{ title: "Not found — The Fish Tank" }] };
    }
    const url = `${SITE}/products/${product.slug}`;
    const img = product.images[0]?.url;
    const desc = (
      product.description ?? `${product.name} — available at The Fish Tank, Sandy UT.`
    ).slice(0, 155);
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: product.images.map((i) => i.url),
      description: product.description ?? undefined,
      sku: product.id,
      category: product.category ?? undefined,
      offers: {
        "@type": "Offer",
        priceCurrency: product.currency || "USD",
        price: product.price ?? undefined,
        availability:
          product.availability === "sold"
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
        url,
        seller: { "@type": "Store", name: "The Fish Tank" },
      },
    };
    return {
      meta: [
        { title: `${product.name} | The Fish Tank — Sandy, UT` },
        { name: "description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:title", content: product.name },
        { property: "og:description", content: desc },
        ...(img ? [{ property: "og:image", content: img }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
    };
  },
  component: ProductDetailPage,
  notFoundComponent: PdpNotFound,
});

function ProductDetailPage() {
  const { slug } = Route.useParams();
  const { data: product } = useSuspenseQuery(productQuery(slug));
  if (!product) return <PdpNotFound />;

  return (
    <article
      style={{
        maxWidth: "var(--container-xl)",
        margin: "0 auto",
        padding: "var(--space-8) var(--gutter) 0",
      }}
    >
      <Breadcrumb name={product.name} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-10)" }}>
        <Gallery product={product} />
        <Details product={product} />
      </div>
    </article>
  );
}

/* ---------------- gallery (with daylight/actinic toggle) ---------------- */
function Gallery({ product }: { product: Product }) {
  const [view, setView] = useState<"daylight" | "actinic">("daylight");
  const hasImages = product.images.length > 0;
  const hero = product.images.find((i) => i.isPrimary) ?? product.images[0];
  const heroUrl = hero?.url ?? PLACEHOLDER;
  const actinicFilter = "saturate(1.5) hue-rotate(200deg) brightness(0.85) contrast(1.15)";
  const onSale = (product.compareAtPrice ?? 0) > (product.price ?? 0);

  return (
    <div>
      <div
        style={{
          position: "relative",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          aspectRatio: "1/1",
          boxShadow: "var(--shadow-md)",
          background: view === "actinic" ? "var(--abyss-950)" : "var(--surface-sunken)",
        }}
      >
        <img
          src={heroUrl}
          alt={hero?.alt ?? product.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: hasImages ? "cover" : "contain",
            filter: view === "actinic" ? actinicFilter : "none",
            transition: "filter var(--dur-base) var(--ease-out)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "var(--space-4)",
            left: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "flex-start",
          }}
        >
          {onSale && <Pill tone="danger">{pctOff(product)}% OFF</Pill>}
          {product.isWysiwyg && <Pill tone="ocean">WYSIWYG</Pill>}
        </div>
        {/* daylight/actinic toggle (CSS approximation of the actinic view) */}
        <div
          style={{
            position: "absolute",
            bottom: "var(--space-4)",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
            padding: 4,
            borderRadius: "var(--radius-full)",
            background: "rgba(13,23,41,0.65)",
            backdropFilter: "blur(8px)",
          }}
        >
          {(["daylight", "actinic"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setView(k)}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "6px 14px",
                borderRadius: "var(--radius-full)",
                font: "var(--fw-semibold) var(--text-xs)/1 var(--font-sans)",
                background: view === k ? "#fff" : "transparent",
                color: view === k ? "var(--ink-950)" : "#fff",
              }}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {product.images.length > 1 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: "var(--space-3)",
            marginTop: "var(--space-3)",
          }}
        >
          {product.images.slice(0, 4).map((im, i) => (
            <div
              key={i}
              style={{
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                aspectRatio: "1/1",
                boxShadow: i === 0 ? "0 0 0 2px var(--brand-primary)" : "var(--ring-hairline)",
              }}
            >
              <img
                src={im.url}
                alt={im.alt ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- details / buy box ---------------- */
function Details({ product }: { product: Product }) {
  const sold = product.availability === "sold";
  const onSale = (product.compareAtPrice ?? 0) > (product.price ?? 0);
  const specs: Array<[React.ComponentType<{ size?: number }>, string, string]> = [
    [HeartPulse, "Care level", product.careLevel ?? ""],
    [ShieldCheck, "Reef compatibility", product.reefSafe ?? ""],
    [Ruler, "Size", product.size ?? ""],
    [MapPin, "Location", product.tankLocation ?? ""],
  ].filter(([, , v]) => v) as Array<[React.ComponentType<{ size?: number }>, string, string]>;

  return (
    <div>
      {product.originRegion && (
        <div
          style={{
            font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
            letterSpacing: "var(--tracking-wide)",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 6,
          }}
        >
          {product.originRegion}
        </div>
      )}
      <h1 style={{ font: "var(--fw-extra) var(--text-4xl)/1.04 var(--font-display)", margin: 0 }}>
        {product.name}
      </h1>
      {product.scientificName && (
        <div
          style={{
            font: "italic var(--text-lg)/1.2 var(--font-sans)",
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          {product.scientificName}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-3)",
          marginTop: "var(--space-5)",
        }}
      >
        <span
          style={{
            font: "var(--fw-extra) var(--text-4xl)/1 var(--font-display)",
            color: onSale ? "var(--status-danger)" : "var(--text-heading)",
          }}
        >
          {formatPrice(product.price)}
        </span>
        {onSale && (
          <span
            style={{
              font: "var(--fw-medium) var(--text-lg)/1 var(--font-sans)",
              color: "var(--text-muted)",
              textDecoration: "line-through",
            }}
          >
            {formatPrice(product.compareAtPrice)}
          </span>
        )}
        {onSale && <Pill tone="danger">Save {pctOff(product)}%</Pill>}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginTop: "var(--space-3)",
          font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
          color: sold ? "var(--text-muted)" : "var(--status-success)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: sold ? "var(--text-muted)" : "var(--status-success)",
          }}
        />
        {sold ? "Sold out — check back soon" : "In stock · ready to ship overnight"}
      </div>

      {product.description && (
        <p
          style={{
            font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
            color: "var(--text-secondary)",
            marginTop: "var(--space-5)",
          }}
        >
          {product.description}
        </p>
      )}

      {!!specs.length && (
        <div style={{ margin: "var(--space-6) 0" }}>
          {specs.map(([Icon, label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3) 0",
                borderBottom: "1px solid var(--border-default)",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--radius-md)",
                  background: "var(--blue-50)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--brand-primary)",
                  flex: "none",
                }}
              >
                <Icon size={17} />
              </div>
              <span
                style={{
                  font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
                  color: "var(--text-muted)",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
                  color: "var(--text-heading)",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button
          disabled={sold}
          style={{
            flex: 1,
            height: "var(--control-lg)",
            border: "none",
            borderRadius: "var(--radius-md)",
            background: sold ? "var(--surface-sunken)" : "var(--brand-primary)",
            color: sold ? "var(--text-muted)" : "var(--text-on-brand)",
            boxShadow: sold ? "none" : "var(--glow-blue)",
            cursor: sold ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            font: "var(--fw-bold) var(--text-base)/1 var(--font-sans)",
          }}
        >
          <ShoppingCart size={18} />
          {sold ? "Sold out" : `Add to cart · ${formatPrice(product.price)}`}
        </button>
        <button
          style={{
            height: "var(--control-lg)",
            padding: "0 18px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-strong)",
            background: "var(--surface-card)",
            color: "var(--text-heading)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            font: "var(--fw-semibold) var(--text-base)/1 var(--font-sans)",
          }}
        >
          <Heart size={18} />
          Save
        </button>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
          font: "var(--fw-regular) var(--text-xs)/1.4 var(--font-sans)",
          color: "var(--text-muted)",
        }}
      >
        <ShieldCheck size={15} />
        Covered by our 5-day reef-safe arrival guarantee · Free FedEx overnight over $250
      </div>
    </div>
  );
}

/* ---------------- small bits ---------------- */
function Pill({ tone, children }: { tone: "danger" | "ocean"; children: React.ReactNode }) {
  const bg = tone === "danger" ? "var(--status-danger)" : "var(--brand-primary)";
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        padding: "5px 10px",
        borderRadius: "var(--radius-full)",
      }}
    >
      {children}
    </span>
  );
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
        color: "var(--text-muted)",
        marginBottom: "var(--space-6)",
      }}
    >
      <Link to="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
        Home
      </Link>
      <ChevronRight size={14} />
      <span style={{ color: "var(--text-secondary)" }}>Live Stock</span>
      <ChevronRight size={14} />
      <span style={{ color: "var(--text-secondary)" }}>{name}</span>
    </nav>
  );
}

function PdpNotFound() {
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
        We couldn't find that one
      </h1>
      <p
        style={{
          font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
          color: "var(--text-secondary)",
          marginTop: "var(--space-3)",
        }}
      >
        It may have sold — livestock moves fast. Browse what's swimming right now.
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
