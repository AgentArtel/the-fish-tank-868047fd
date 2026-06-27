import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, Phone, Mail, Navigation } from "lucide-react";
import {
  getSiteSettings,
  getStoreLocation,
  type StoreLocation,
} from "@/lib/public-site.functions";

// /visit — the local-SEO cornerstone page. Ported from
// design-system/reference/VisitUs.tsx.txt → TanStack: react-router useQuery →
// loader (ensureQueryData) + useSuspenseQuery, react-helmet → head() with
// PetStore (LocalBusiness) JSON-LD + canonical, data-lucide → lucide-react, the
// DS Button → reused storefront-token anchors. NAP/hours/geo all come from
// getStoreLocation("sandy") — NEVER hard-coded — and service areas from
// getSiteSettings (v_public_site_settings.service_areas). NO Review/AggregateRating.

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

const oneLineAddress = (loc: StoreLocation) => {
  const a = loc.address;
  return [a.street, a.city && `${a.city},`, a.region, a.postal].filter(Boolean).join(" ");
};

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

export const Route = createFileRoute("/(public)/visit")({
  loader: async ({ context }) => {
    const [settings, location] = await Promise.all([
      context.queryClient.ensureQueryData(siteSettingsQuery),
      context.queryClient.ensureQueryData(storeLocationQuery),
    ]);
    return { settings, location };
  },
  head: ({ loaderData }) => {
    const loc = loaderData?.location ?? undefined;
    const settings = loaderData?.settings;
    const url = `${SITE}/visit`;
    const city = loc?.address.city ?? "Sandy";
    const title = `Visit Us — The Fish Tank | Saltwater Fish & Coral, ${city} UT`;

    if (!loc) {
      return {
        meta: [{ title }],
        links: [{ rel: "canonical", href: url }],
      };
    }

    const a = loc.address;
    const oneLine = oneLineAddress(loc);
    const desc = `Visit The Fish Tank at ${oneLine}. Utah's saltwater fish & coral store, serving the Salt Lake Valley.`;

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "PetStore",
      name: loc.name || settings?.siteTitle || "The Fish Tank",
      url,
      priceRange: "$$",
      address: {
        "@type": "PostalAddress",
        streetAddress: [a.street, a.street2].filter(Boolean).join(", ") || undefined,
        addressLocality: a.city || undefined,
        addressRegion: a.region || undefined,
        postalCode: a.postal || undefined,
        addressCountry: a.country || "US",
      },
    };
    if (loc.phone) jsonLd.telephone = loc.phone;
    if (loc.email) jsonLd.email = loc.email;
    if (loc.geo.lat != null && loc.geo.lng != null)
      jsonLd.geo = { "@type": "GeoCoordinates", latitude: loc.geo.lat, longitude: loc.geo.lng };
    if (settings?.serviceAreas?.length) jsonLd.areaServed = settings.serviceAreas;
    const openingHours = (loc.hours ?? [])
      .filter((h) => h.open && h.close)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_FULL[h.day] ?? h.day,
        opens: h.open,
        closes: h.close,
      }));
    if (openingHours.length) jsonLd.openingHoursSpecification = openingHours;
    if (loc.primaryPhotoUrl) jsonLd.image = loc.primaryPhotoUrl;
    else if (settings?.defaultOgImage) jsonLd.image = settings.defaultOgImage;

    return {
      meta: [
        { title },
        { name: "description", content: desc.slice(0, 155) },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc.slice(0, 155) },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
    };
  },
  component: VisitPage,
});

function VisitPage() {
  const { data: settings } = useSuspenseQuery(siteSettingsQuery);
  const { data: location } = useSuspenseQuery(storeLocationQuery);

  if (!location) {
    return (
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "var(--space-24) var(--gutter)",
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        <h1
          style={{
            font: "var(--fw-extra) var(--text-3xl)/1.1 var(--font-display)",
            color: "var(--text-heading)",
          }}
        >
          Visit The Fish Tank
        </h1>
        <p style={{ font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)" }}>
          Showroom details are being updated — please check back shortly.
        </p>
      </div>
    );
  }

  const a = location.address;
  const oneLine = oneLineAddress(location);
  const mapsQ = encodeURIComponent(`The Fish Tank, ${oneLine}`);
  const todayKey = DAYS[new Date().getDay()];
  const serviceAreas = settings.serviceAreas;

  return (
    <div>
      {/* hero */}
      <section style={{ background: "var(--grad-ocean)", color: "var(--text-on-ocean)" }}>
        <div
          style={{
            maxWidth: "var(--container-xl)",
            margin: "0 auto",
            padding: "var(--space-16) var(--gutter)",
          }}
        >
          <div
            style={{
              font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              color: "var(--brand-cyan)",
              marginBottom: 10,
            }}
          >
            Visit the showroom
          </div>
          <h1
            style={{
              font: "var(--fw-extra) var(--text-4xl)/1.02 var(--font-display)",
              color: "#fff",
              margin: 0,
            }}
          >
            Utah's saltwater fish &amp; coral store
          </h1>
          <p
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
              marginTop: "var(--space-3)",
              maxWidth: 560,
            }}
          >
            Five minutes off I-15 in {a.city}, our reef showroom holds dozens of display systems of
            hand-selected corals, fish, and inverts — serving reef-keepers across the Salt Lake
            Valley and the Wasatch Front.
          </p>
        </div>
      </section>

      <section
        style={{
          maxWidth: "var(--container-xl)",
          margin: "0 auto",
          padding: "var(--space-16) var(--gutter)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-10)",
          alignItems: "start",
        }}
      >
        {/* left: contact + map */}
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <Row icon={MapPin} label="Address">
              {oneLine}
            </Row>
            {location.phone && (
              <Row icon={Phone} label="Phone">
                <a
                  href={location.phoneHref ?? undefined}
                  style={{ color: "var(--text-body)", textDecoration: "none" }}
                >
                  {location.phone}
                </a>
              </Row>
            )}
            {location.email && (
              <Row icon={Mail} label="Email">
                <a
                  href={`mailto:${location.email}`}
                  style={{ color: "var(--text-body)", textDecoration: "none" }}
                >
                  {location.email}
                </a>
              </Row>
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
            {location.phoneHref && (
              <a
                href={location.phoneHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
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
                <Phone size={18} />
                Call the shop
              </a>
            )}
          </div>

          {/* map embed */}
          <div
            style={{
              marginTop: "var(--space-6)",
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              boxShadow: "var(--ring-hairline), var(--shadow-sm)",
              aspectRatio: "16/10",
            }}
          >
            <iframe
              title="Map to The Fish Tank"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://www.google.com/maps?q=${mapsQ}&output=embed`}
            />
          </div>

          {serviceAreas.length > 0 && (
            <p
              style={{
                font: "var(--fw-regular) var(--text-xs)/1.5 var(--font-sans)",
                color: "var(--text-muted)",
                marginTop: "var(--space-5)",
              }}
            >
              Serving {serviceAreas.slice(0, 6).join(" · ")} &amp; the greater Salt Lake Valley.
            </p>
          )}
        </div>

        {/* right: hours */}
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
      </section>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-full)",
          background: "var(--blue-50)",
          color: "var(--brand-primary)",
          display: "grid",
          placeItems: "center",
          flex: "none",
        }}
      >
        <Icon size={18} />
      </div>
      <div>
        <div
          style={{
            font: "var(--fw-regular) var(--text-xs)/1.3 var(--font-sans)",
            color: "var(--text-muted)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            font: "var(--fw-regular) var(--text-base)/1.4 var(--font-sans)",
            color: "var(--text-body)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
