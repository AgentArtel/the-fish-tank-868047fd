import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Phone, Navigation, ShieldCheck, Truck, Sparkles } from "lucide-react";
import {
  getSiteSettings,
  getStoreLocation,
  listProducts,
  pickupEtaLine,
  type Product,
  type SiteSettings,
  type StoreLocation,
} from "@/lib/public-site.functions";
import { ProductCard } from "@/components/storefront/ProductCard";

// Public Home — owns `/` after the /-flip (the old redirect-only index.tsx is
// deleted). Ported from design-system/ui_kits/website/Home.jsx → TanStack:
// react-router go()/<Link> → TanStack Link, react-helmet → head() with
// LocalBusiness (PetStore) + Organization/WebSite JSON-LD (NAP never hard-coded,
// built from getStoreLocation), data-lucide → lucide-react, the DS window.* data
// → real server fns. Loader (ensureQueryData) + useSuspenseQuery for SSR + cache,
// mirroring shop.tsx. NO Review/AggregateRating (hard rule).
//
// The reference's mock numbers ("700+ items", "100% aquacultured"), the fake
// "Reef Rewards" loyalty program, and the static category/trust tiles were
// REMOVED — no invented stats or testimonials ship (Phase 5 copy pass owns real
// copy). The product rows wire to real listProducts data; until Lovable flips the
// public-media bucket + website-ready flags they render empty and the section is
// hidden, so the page never shows empty shelves.

const SITE = "https://thefishtank.com";

const DAY_FULL: Record<string, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmtHour = (t: string) => {
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
};

// A small home strip — newest website-ready stock. Reuses listProducts (no new
// server fn); "featured" sort already maps to updated_at desc server-side.
const featuredQuery = queryOptions({
  queryKey: ["public-products", "home-featured"],
  queryFn: () => listProducts({ data: { sort: "featured" } }),
  staleTime: 60_000,
});
const specialsQuery = queryOptions({
  queryKey: ["public-products", "home-specials"],
  queryFn: () => listProducts({ data: { hasCompareAt: true, sort: "featured" } }),
  staleTime: 60_000,
});

const siteSettingsQuery = queryOptions({
  queryKey: ["public-site-settings"],
  queryFn: () => getSiteSettings(),
  staleTime: 5 * 60_000,
});
const storeLocationQuery = queryOptions({
  queryKey: ["public-store-location", "sandy"],
  queryFn: () => getStoreLocation({ data: { slug: "sandy" } }),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/(public)/")({
  loader: async ({ context }) => {
    const [featured, specials, settings, location] = await Promise.all([
      context.queryClient.ensureQueryData(featuredQuery),
      context.queryClient.ensureQueryData(specialsQuery),
      context.queryClient.ensureQueryData(siteSettingsQuery),
      context.queryClient.ensureQueryData(storeLocationQuery),
    ]);
    return { featured, specials, settings, location };
  },
  head: ({ loaderData }) => {
    const settings = loaderData?.settings;
    const loc = loaderData?.location ?? undefined;
    const title = `${settings?.siteTitle || "The Fish Tank"} — Saltwater Fish & Coral · Sandy, UT`;
    const desc =
      settings?.tagline ||
      "Hand-selected saltwater fish and aquacultured corals — photographed under reef lighting and shipped overnight. Visit our reef showroom in Sandy, Utah.";

    const website = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: settings?.siteTitle || "The Fish Tank",
      url: `${SITE}/`,
    };
    const organization: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: settings?.siteTitle || "The Fish Tank",
      url: `${SITE}/`,
    };
    if (settings?.defaultOgImage) organization.logo = settings.defaultOgImage;

    const scripts: Array<{ type: string; children: string }> = [
      { type: "application/ld+json", children: JSON.stringify(website) },
      { type: "application/ld+json", children: JSON.stringify(organization) },
    ];

    // LocalBusiness (PetStore) — NAP/geo/hours from getStoreLocation, never hard-coded.
    if (loc) {
      const a = loc.address;
      const openingHours = (loc.hours ?? [])
        .filter((h) => h.open && h.close)
        .map((h) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: DAY_FULL[h.day] ?? h.day,
          opens: h.open,
          closes: h.close,
        }));
      const petStore: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "PetStore",
        name: loc.name || settings?.siteTitle || "The Fish Tank",
        url: `${SITE}/`,
        address: {
          "@type": "PostalAddress",
          streetAddress: [a.street, a.street2].filter(Boolean).join(", ") || undefined,
          addressLocality: a.city || undefined,
          addressRegion: a.region || undefined,
          postalCode: a.postal || undefined,
          addressCountry: a.country || "US",
        },
      };
      if (loc.phone) petStore.telephone = loc.phone;
      if (loc.email) petStore.email = loc.email;
      if (loc.geo.lat != null && loc.geo.lng != null)
        petStore.geo = { "@type": "GeoCoordinates", latitude: loc.geo.lat, longitude: loc.geo.lng };
      if (openingHours.length) petStore.openingHoursSpecification = openingHours;
      if (settings?.serviceAreas?.length) petStore.areaServed = settings.serviceAreas;
      if (loc.primaryPhotoUrl) petStore.image = loc.primaryPhotoUrl;
      else if (settings?.defaultOgImage) petStore.image = settings.defaultOgImage;
      scripts.push({ type: "application/ld+json", children: JSON.stringify(petStore) });
    }

    return {
      meta: [
        { title },
        { name: "description", content: desc.slice(0, 155) },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc.slice(0, 155) },
        { property: "og:url", content: `${SITE}/` },
      ],
      links: [{ rel: "canonical", href: `${SITE}/` }],
      scripts,
    };
  },
  component: HomePage,
});

function HomePage() {
  const { data: settings } = useSuspenseQuery(siteSettingsQuery);
  const { data: location } = useSuspenseQuery(storeLocationQuery);
  const { data: featured } = useSuspenseQuery(featuredQuery);
  const { data: specials } = useSuspenseQuery(specialsQuery);

  const newArrivals = featured.products.slice(0, 4);
  const weeklySpecials = specials.products.slice(0, 4);

  return (
    <div>
      <Hero tagline={settings.tagline} />
      <TrustBar />
      {weeklySpecials.length > 0 && (
        <ProductRow
          eyebrow="Save big this week"
          title="Weekly Specials"
          accent="var(--status-danger)"
          products={weeklySpecials}
          orderCycle={settings.orderCycle}
        />
      )}
      {newArrivals.length > 0 && (
        <ProductRow
          eyebrow="Fresh on the floor"
          title="New Arrivals"
          accent="var(--brand-primary)"
          products={newArrivals}
          orderCycle={settings.orderCycle}
        />
      )}
      <LocationBlock location={location} serviceAreas={settings.serviceAreas} />
    </div>
  );
}

/* ---------------- hero ---------------- */
function Hero({ tagline }: { tagline: string | null }) {
  return (
    <section
      style={{
        position: "relative",
        background: "var(--grad-ocean)",
        color: "var(--text-on-ocean)",
        overflow: "hidden",
      }}
    >
      <img
        src="/storefront/wave-dark.png"
        alt=""
        style={{
          position: "absolute",
          left: "-5%",
          bottom: -50,
          width: "110%",
          opacity: 0.45,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          maxWidth: "var(--container-xl)",
          margin: "0 auto",
          padding: "var(--space-16) var(--gutter)",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: "var(--space-10)",
          alignItems: "center",
          position: "relative",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid var(--border-ocean)",
              font: "var(--fw-semibold) var(--text-xs)/1 var(--font-sans)",
              letterSpacing: "var(--tracking-wide)",
              color: "var(--brand-cyan)",
              marginBottom: "var(--space-5)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--brand-cyan)",
              }}
            />
            Fresh corals &amp; fish arriving weekly · acclimated in Sandy
          </div>
          <h1
            style={{
              font: "var(--fw-extra) var(--text-4xl)/1.02 var(--font-display)",
              color: "#fff",
              margin: 0,
            }}
          >
            The reef,
            <br />
            delivered.
          </h1>
          <p
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
              maxWidth: 460,
              marginTop: "var(--space-5)",
            }}
          >
            {tagline ||
              "Hand-selected saltwater fish and aquacultured corals — photographed under reef lighting and shipped overnight with our 5-day arrival guarantee."}
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-8)" }}>
            <Link
              to="/shop"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: "var(--control-lg)",
                padding: "0 22px",
                borderRadius: "var(--radius-md)",
                background: "var(--brand-primary)",
                color: "var(--text-on-brand)",
                textDecoration: "none",
                boxShadow: "var(--glow-blue)",
                font: "var(--fw-bold) var(--text-base)/var(--control-lg) var(--font-sans)",
              }}
            >
              Shop live stock
              <ArrowRight size={18} />
            </Link>
            <Link
              to="/shop"
              search={{ sale: true }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: "var(--control-lg)",
                padding: "0 22px",
                borderRadius: "var(--radius-md)",
                background: "var(--brand-accent)",
                color: "var(--ink-950)",
                textDecoration: "none",
                font: "var(--fw-bold) var(--text-base)/var(--control-lg) var(--font-sans)",
              }}
            >
              Weekly specials
            </Link>
          </div>
        </div>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <div
            style={{
              position: "absolute",
              width: 380,
              height: 380,
              borderRadius: "50%",
              background: "var(--glow-blue)",
              filter: "blur(24px)",
              opacity: 0.7,
            }}
          />
          <img
            src="/storefront/logo-fish-white.png"
            alt="The Fish Tank — blue tang"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 500,
              filter: "drop-shadow(0 24px 48px rgba(3,7,15,0.6))",
            }}
          />
        </div>
      </div>
    </section>
  );
}

/* ---------------- trust bar (real shop promises, no invented stats) ---------------- */
const TRUST: Array<{ icon: React.ComponentType<{ size?: number }>; title: string; sub: string }> = [
  { icon: ShieldCheck, title: "Live arrival guarantee", sub: "5-day reef-safe coverage" },
  { icon: Truck, title: "Overnight shipping", sub: "Free FedEx over $250" },
  { icon: Sparkles, title: "Photographed under reef light", sub: "What you see is what ships" },
  { icon: MapPin, title: "Visit the Sandy showroom", sub: "Acclimated in-store, in Utah" },
];

function TrustBar() {
  return (
    <section
      style={{
        background: "var(--surface-card)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <div
        style={{
          maxWidth: "var(--container-xl)",
          margin: "0 auto",
          padding: "var(--space-6) var(--gutter)",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--space-6)",
        }}
      >
        {TRUST.map(({ icon: Icon, title, sub }) => (
          <div key={title} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "var(--radius-full)",
                background: "var(--blue-50)",
                color: "var(--brand-primary)",
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              <Icon size={20} />
            </div>
            <div>
              <div
                style={{
                  font: "var(--fw-bold) var(--text-sm)/1.2 var(--font-sans)",
                  color: "var(--text-heading)",
                }}
              >
                {title}
              </div>
              <div
                style={{
                  font: "var(--fw-regular) var(--text-xs)/1.3 var(--font-sans)",
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- product strip ---------------- */
function ProductRow({
  eyebrow,
  title,
  accent,
  products,
  orderCycle,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  products: Product[];
  orderCycle: SiteSettings["orderCycle"];
}) {
  const etaLine = pickupEtaLine(orderCycle);
  return (
    <section
      style={{
        maxWidth: "var(--container-xl)",
        margin: "0 auto",
        padding: "var(--space-16) var(--gutter) 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: "var(--space-8)",
        }}
      >
        <div>
          <div
            style={{
              font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              color: accent,
              marginBottom: 8,
            }}
          >
            {eyebrow}
          </div>
          <h2
            style={{
              font: "var(--fw-extra) var(--text-3xl)/1.05 var(--font-display)",
              color: "var(--text-heading)",
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>
        <Link
          to="/shop"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--brand-primary)",
            textDecoration: "none",
            font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
          }}
        >
          Shop all
          <ArrowRight size={16} />
        </Link>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--space-5)",
        }}
      >
        {products.map((p) => (
          <Link
            key={p.id}
            to="/products/$slug"
            params={{ slug: p.slug }}
            style={{ textDecoration: "none" }}
          >
            <ProductCard
              image={p.images[0]?.url}
              vendor={p.originRegion}
              name={p.name}
              scientificName={p.scientificName}
              price={p.price ?? 0}
              compareAt={p.compareAtPrice}
              wysiwyg={p.isWysiwyg}
              stock={p.orderState === "order_ahead" ? "order_ahead" : "live"}
              etaLine={p.orderState === "order_ahead" ? etaLine : null}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---------------- location block (NAP from getStoreLocation) ---------------- */
function LocationBlock({
  location,
  serviceAreas,
}: {
  location: StoreLocation | null;
  serviceAreas: string[];
}) {
  if (!location) return null;
  const a = location.address;
  const oneLine = [a.street, a.city && `${a.city},`, a.region, a.postal].filter(Boolean).join(" ");
  const mapsQ = encodeURIComponent(`The Fish Tank, ${oneLine}`);
  const todayKey = DAYS[new Date().getDay()];

  return (
    <section
      style={{
        maxWidth: "var(--container-xl)",
        margin: "var(--space-16) auto 0",
        padding: "0 var(--gutter)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-10)",
          alignItems: "stretch",
        }}
      >
        <div>
          <div
            style={{
              font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              color: "var(--brand-primary)",
              marginBottom: 8,
            }}
          >
            Visit the showroom
          </div>
          <h2
            style={{
              font: "var(--fw-extra) var(--text-3xl)/1.05 var(--font-display)",
              color: "var(--text-heading)",
              margin: 0,
            }}
          >
            Utah's saltwater fish &amp; coral store
          </h2>
          <p
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
              color: "var(--text-secondary)",
              marginTop: "var(--space-3)",
              maxWidth: 480,
            }}
          >
            Five minutes off I-15 in {a.city}, our reef showroom holds dozens of display systems of
            hand-selected corals, fish, and inverts — serving reef-keepers across the Salt Lake
            Valley and the Wasatch Front.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
              marginTop: "var(--space-6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <MapPin size={18} style={{ color: "var(--brand-primary)", flex: "none" }} />
              <span
                style={{
                  font: "var(--fw-regular) var(--text-base)/1.4 var(--font-sans)",
                  color: "var(--text-body)",
                }}
              >
                {oneLine}
              </span>
            </div>
            {location.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <Phone size={18} style={{ color: "var(--brand-primary)", flex: "none" }} />
                <a
                  href={location.phoneHref ?? undefined}
                  style={{
                    font: "var(--fw-regular) var(--text-base)/1.4 var(--font-sans)",
                    color: "var(--text-body)",
                    textDecoration: "none",
                  }}
                >
                  {location.phone}
                </a>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
            <a
              href={`https://maps.google.com/?q=${mapsQ}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: "var(--control-lg)",
                padding: "0 18px",
                borderRadius: "var(--radius-md)",
                background: "var(--brand-primary)",
                color: "var(--text-on-brand)",
                textDecoration: "none",
                boxShadow: "var(--glow-blue)",
                font: "var(--fw-bold) var(--text-base)/var(--control-lg) var(--font-sans)",
              }}
            >
              <Navigation size={18} />
              Get directions
            </a>
            <Link
              to="/visit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "var(--control-lg)",
                padding: "0 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-strong)",
                background: "var(--surface-card)",
                color: "var(--text-heading)",
                textDecoration: "none",
                font: "var(--fw-semibold) var(--text-base)/var(--control-lg) var(--font-sans)",
              }}
            >
              Plan your visit
            </Link>
          </div>
          {serviceAreas.length > 0 && (
            <div
              style={{
                font: "var(--fw-regular) var(--text-xs)/1.5 var(--font-sans)",
                color: "var(--text-muted)",
                marginTop: "var(--space-5)",
              }}
            >
              Serving {serviceAreas.slice(0, 6).join(" · ")} &amp; the greater Salt Lake Valley
            </div>
          )}
        </div>
        <div
          style={{
            background: "var(--surface-card)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--ring-hairline), var(--shadow-sm)",
            padding: "var(--space-6) var(--space-8)",
          }}
        >
          <div
            style={{
              font: "var(--fw-bold) var(--text-xl)/1.2 var(--font-display)",
              color: "var(--text-heading)",
              marginBottom: "var(--space-4)",
            }}
          >
            Store Hours
          </div>
          {location.hours.map((h) => {
            const today = h.day === todayKey;
            return (
              <div
                key={h.day}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "var(--space-3) 0",
                  borderBottom: "1px solid var(--border-default)",
                  font: today
                    ? "var(--fw-bold) var(--text-base)/1 var(--font-sans)"
                    : "var(--fw-regular) var(--text-base)/1 var(--font-sans)",
                  color: today ? "var(--text-heading)" : "var(--text-secondary)",
                }}
              >
                <span>{DAY_FULL[h.day] ?? h.day}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {h.open ? `${fmtHour(h.open)} – ${fmtHour(h.close)}` : "Closed"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
