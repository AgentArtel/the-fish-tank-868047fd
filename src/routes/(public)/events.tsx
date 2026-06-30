import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Calendar, Clock, MapPin } from "lucide-react";
import { Markdown } from "@/components/storefront/Markdown";
import { getStoreLocation, listEvents, type EventItem } from "@/lib/public-site.functions";

// /events — upcoming frag swaps, live sales, reef nights. Ported from
// design-system/reference/Events.tsx.txt → TanStack: Helmet→head() with one
// Event JSON-LD per item (local signal), data-lucide→lucide-react. Loader
// (ensureQueryData) + useSuspenseQuery for SSR+cache. Empty state expected
// until Lovable seeds + publishes events. Place address comes from
// getStoreLocation (NAP never hard-coded).

const SITE = "https://thefishtank.com";
const TITLE = "Events";
const DESC =
  "Upcoming events at The Fish Tank in Sandy, UT — frag swaps, live sales, and beginner reef nights. Join the Salt Lake Valley reef community.";

const eventsQuery = queryOptions({
  queryKey: ["public-events", "upcoming"],
  queryFn: () => listEvents({ data: { upcomingOnly: true } }),
  staleTime: 60_000,
});

const storeLocationQuery = queryOptions({
  queryKey: ["public-store-location", "sandy"],
  queryFn: () => getStoreLocation({ data: { slug: "sandy" } }),
  staleTime: 5 * 60_000,
});

function eventLd(e: EventItem, place: Awaited<ReturnType<typeof getStoreLocation>> | undefined) {
  const a = place?.address;
  const address = a
    ? {
        "@type": "PostalAddress",
        streetAddress: [a.street, a.street2].filter(Boolean).join(", ") || undefined,
        addressLocality: a.city || undefined,
        addressRegion: a.region || undefined,
        postalCode: a.postal || undefined,
        addressCountry: a.country || "US",
      }
    : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.descriptionMarkdown ?? undefined,
    startDate: e.startsAt ?? undefined,
    endDate: e.endsAt ?? undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: e.locationText || place?.name || "The Fish Tank",
      address,
    },
    image: e.heroImage ?? undefined,
    organizer: { "@type": "Organization", name: "The Fish Tank", url: SITE },
  };
}

export const Route = createFileRoute("/(public)/events")({
  loader: async ({ context }) => {
    const [events, location] = await Promise.all([
      context.queryClient.ensureQueryData(eventsQuery),
      context.queryClient.ensureQueryData(storeLocationQuery),
    ]);
    return { events, location };
  },
  head: ({ loaderData }) => {
    const url = `${SITE}/events`;
    const events = loaderData?.events ?? [];
    return {
      meta: [
        { title: `${TITLE} — The Fish Tank | Frag Swaps & Reef Nights, Sandy UT` },
        { name: "description", content: DESC },
        { property: "og:type", content: "website" },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESC },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: events.map((e) => ({
        type: "application/ld+json" as const,
        children: JSON.stringify(eventLd(e, loaderData?.location ?? undefined)),
      })),
    };
  },
  component: EventsPage,
});

function EventsPage() {
  const { data: events } = useSuspenseQuery(eventsQuery);
  const { data: location } = useSuspenseQuery(storeLocationQuery);
  const fallbackPlace = location?.name ?? "Sandy showroom";

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
            {TITLE}
          </h1>
          <p
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
              marginTop: "var(--space-3)",
              maxWidth: 560,
            }}
          >
            Frag swaps, live sales, and reef nights at our Sandy showroom. Come talk tanks with the
            Salt Lake Valley reef community.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 820, margin: "0 auto", padding: "var(--space-12) var(--gutter)" }}>
        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "var(--space-20)", color: "var(--text-muted)" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Calendar size={40} />
            </div>
            <div
              style={{
                font: "var(--fw-bold) var(--text-xl)/1.2 var(--font-display)",
                color: "var(--text-heading)",
                marginTop: 12,
              }}
            >
              No events scheduled right now
            </div>
            <p style={{ font: "var(--fw-regular) var(--text-sm)/1.5 var(--font-sans)", marginTop: 6 }}>
              Follow us for the next frag swap announcement.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {events.map((e) => (
              <EventRow key={e.id} e={e} fallbackPlace={fallbackPlace} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EventRow({ e, fallbackPlace }: { e: EventItem; fallbackPlace: string }) {
  const start = e.startsAt ? new Date(e.startsAt) : null;
  const allDay =
    !!start && start.getHours() === 0 && start.getMinutes() === 0 && e.endsAt == null;
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-5)",
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--ring-hairline), var(--shadow-sm)",
        padding: "var(--space-5)",
        alignItems: "center",
      }}
    >
      <div
        style={{
          flex: "none",
          width: 72,
          textAlign: "center",
          background: "var(--blue-50)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3) 0",
        }}
      >
        <div
          style={{
            font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
            letterSpacing: "var(--tracking-wide)",
            textTransform: "uppercase",
            color: "var(--brand-primary)",
          }}
        >
          {start ? start.toLocaleDateString("en-US", { month: "short" }) : "—"}
        </div>
        <div
          style={{
            font: "var(--fw-extra) var(--text-3xl)/1 var(--font-display)",
            color: "var(--text-heading)",
          }}
        >
          {start ? start.getDate() : ""}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            font: "var(--fw-bold) var(--text-xl)/1.2 var(--font-display)",
            color: "var(--text-heading)",
          }}
        >
          {e.title}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            font: "var(--fw-regular) var(--text-xs)/1.4 var(--font-sans)",
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Clock size={13} />
            {start
              ? allDay
                ? "All day"
                : start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "TBA"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <MapPin size={13} />
            {e.locationText || fallbackPlace}
          </span>
        </div>
        {e.descriptionMarkdown && (
          <div
            style={{
              font: "var(--fw-regular) var(--text-sm)/1.5 var(--font-sans)",
              color: "var(--text-secondary)",
              marginTop: "var(--space-2)",
            }}
          >
            <Markdown>{e.descriptionMarkdown}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
