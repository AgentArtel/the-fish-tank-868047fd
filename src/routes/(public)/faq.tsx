import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Markdown } from "@/components/storefront/Markdown";
import { getStoreLocation, listFaqs, type Faq } from "@/lib/public-site.functions";

// /faq — published FAQs grouped by category + FAQPage JSON-LD (rich results).
// Ported from design-system/reference/Faq.tsx.txt → TanStack: Helmet→head(),
// data-lucide→lucide-react, react-markdown for answers. Loader + useSuspenseQuery
// for SSR+cache. Empty state expected until Lovable seeds + publishes FAQs.
// The "call us" line uses getStoreLocation (NAP never hard-coded).

const SITE = "https://thefishtank.com";
const TITLE = "Frequently asked questions";
const DESC =
  "Answers about livestock shipping, the arrival guarantee, Reef Rewards, and visiting our Sandy, UT reef showroom.";

const faqsQuery = queryOptions({
  queryKey: ["public-faqs"],
  queryFn: () => listFaqs(),
  staleTime: 60_000,
});

const storeLocationQuery = queryOptions({
  queryKey: ["public-store-location", "sandy"],
  queryFn: () => getStoreLocation({ data: { slug: "sandy" } }),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/(public)/faq")({
  loader: async ({ context }) => {
    const [faqs] = await Promise.all([
      context.queryClient.ensureQueryData(faqsQuery),
      context.queryClient.ensureQueryData(storeLocationQuery),
    ]);
    return { faqs };
  },
  head: ({ loaderData }) => {
    const url = `${SITE}/faq`;
    const faqs = loaderData?.faqs ?? [];
    const scripts =
      faqs.length > 0
        ? [
            {
              type: "application/ld+json" as const,
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.question,
                  acceptedAnswer: { "@type": "Answer", text: f.answerMarkdown ?? "" },
                })),
              }),
            },
          ]
        : [];
    return {
      meta: [
        { title: `FAQ — The Fish Tank | Shipping, Livestock & Reef Rewards` },
        { name: "description", content: DESC },
        { property: "og:type", content: "website" },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESC },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts,
    };
  },
  component: FaqPage,
});

function FaqPage() {
  const { data: faqs } = useSuspenseQuery(faqsQuery);
  const { data: location } = useSuspenseQuery(storeLocationQuery);

  const groups = useMemo(() => {
    const by: Record<string, Faq[]> = {};
    [...faqs]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((f) => {
        (by[f.category] ||= []).push(f);
      });
    return Object.entries(by);
  }, [faqs]);

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
            Shipping, the arrival guarantee, Reef Rewards, and visiting the shop.
            {location?.phone ? ` Still stuck? Call us at ${location.phone}.` : ""}
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 820, margin: "0 auto", padding: "var(--space-12) var(--gutter)" }}>
        {groups.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "var(--space-16)" }}>
            FAQ coming soon.
          </p>
        ) : (
          groups.map(([category, items]) => (
            <div key={category} style={{ marginBottom: "var(--space-10)" }}>
              <h2
                style={{
                  font: "var(--fw-bold) var(--text-xl)/1.25 var(--font-display)",
                  color: "var(--text-heading)",
                  marginBottom: "var(--space-4)",
                }}
              >
                {category}
              </h2>
              <div>
                {items.map((f) => (
                  <FaqItem key={f.id} f={f} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function FaqItem({ f }: { f: Faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border-default)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          padding: "var(--space-4) 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            font: "var(--fw-semibold) var(--text-base)/1.4 var(--font-sans)",
            color: "var(--text-heading)",
          }}
        >
          {f.question}
        </span>
        <span style={{ color: "var(--brand-primary)", flex: "none", display: "inline-flex" }}>
          {open ? <Minus size={18} /> : <Plus size={18} />}
        </span>
      </button>
      {open && (
        <div
          style={{
            color: "var(--text-secondary)",
            padding: "0 0 var(--space-4)",
          }}
        >
          <Markdown>{f.answerMarkdown}</Markdown>
        </div>
      )}
    </div>
  );
}
