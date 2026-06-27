import { createFileRoute, Outlet } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSiteSettings, getStoreLocation } from "@/lib/public-site.functions";
import { SiteHeader, SiteFooter } from "@/components/storefront/SiteChrome";
import storefrontCss from "../../storefront.css?url";

// Storefront chrome layout group — pathless `(public)`.
// NO auth guard: anonymous visitors must load. Loads site settings + store
// location once (SSR via ensureQueryData) and shares them with every child
// route via the query cache. Emits site-wide LocalBusiness/PetStore JSON-LD
// built from getStoreLocation() (NAP never hard-coded).

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

function localBusinessJsonLd(
  settings: Awaited<ReturnType<typeof getSiteSettings>> | undefined,
  loc: Awaited<ReturnType<typeof getStoreLocation>> | undefined,
) {
  if (!loc) return null;
  const a = loc.address;
  const openingHours = (loc.hours ?? [])
    .filter((h) => h.open && h.close)
    .map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.day,
      opens: h.open,
      closes: h.close,
    }));
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "PetStore",
    name: loc.name || settings?.siteTitle || "The Fish Tank",
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
  if (openingHours.length) jsonLd.openingHoursSpecification = openingHours;
  if (loc.primaryPhotoUrl) jsonLd.image = loc.primaryPhotoUrl;
  if (settings?.defaultOgImage && !jsonLd.image) jsonLd.image = settings.defaultOgImage;
  return jsonLd;
}

export const Route = createFileRoute("/(public)")({
  loader: async ({ context }) => {
    const [settings, location] = await Promise.all([
      context.queryClient.ensureQueryData(siteSettingsQuery),
      context.queryClient.ensureQueryData(storeLocationQuery),
    ]);
    return { settings, location };
  },
  head: ({ loaderData }) => {
    const jsonLd = localBusinessJsonLd(loaderData?.settings, loaderData?.location ?? undefined);
    const ogImage = loaderData?.settings?.defaultOgImage ?? undefined;
    return {
      links: [{ rel: "stylesheet", href: storefrontCss }],
      meta: [
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:site_name", content: loaderData?.settings?.siteTitle ?? "The Fish Tank" },
        ...(ogImage
          ? [
              { property: "og:image", content: ogImage },
              { name: "twitter:image", content: ogImage },
            ]
          : []),
      ],
      scripts: jsonLd
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify(jsonLd),
            },
          ]
        : [],
    };
  },
  component: PublicLayout,
});

function PublicLayout() {
  const { data: settings } = useSuspenseQuery(siteSettingsQuery);
  const { data: location } = useSuspenseQuery(storeLocationQuery);

  return (
    <div
      className="tft-storefront"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <SiteHeader settings={settings} location={location} />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <SiteFooter settings={settings} location={location} />
    </div>
  );
}
