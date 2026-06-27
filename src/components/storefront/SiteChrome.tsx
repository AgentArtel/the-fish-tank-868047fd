import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Search,
  User,
  Heart,
  ShoppingCart,
  ChevronDown,
  MapPin,
  Instagram,
  Facebook,
  Youtube,
} from "lucide-react";
import type { SiteSettings, StoreLocation } from "@/lib/public-site.functions";

/**
 * The Fish Tank — storefront chrome (announcement bar + mega-menu header +
 * footer), ported from design-system/ui_kits/website/SiteChrome.jsx → TSX.
 *
 * NAP is NEVER hard-coded: address/phone/city come from the `location` prop
 * (getStoreLocation) and announcements from `settings` (getSiteSettings).
 * Cart/wishlist/account icons are visual affordances only this phase — there is
 * no commerce backend yet. Mega-menu nav is direction-only and routes are not
 * built yet, so nav items are inert placeholders (no dead links) until Phase 2
 * (/shop, /collections) lands.
 */

const NAV: Array<{ key: string; label: string }> = [
  { key: "corals", label: "Corals" },
  { key: "fish", label: "Fish" },
  { key: "inverts", label: "Inverts & CUC" },
  { key: "supplies", label: "Dry Goods" },
  { key: "learn", label: "Learn" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function openStatus(
  hours: StoreLocation["hours"] | undefined,
  fallbackCity: string | null,
  now = new Date(),
): string {
  if (!hours || hours.length === 0) return fallbackCity ? fallbackCity : "Visit us";
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (t: string) => {
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
  };
  const today = hours.find((h) => h.day === DAYS[now.getDay()]);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (today?.open && cur >= toMin(today.open) && cur < toMin(today.close))
    return `Open today · till ${fmt(today.close)}`;
  for (let i = 1; i <= 7; i++) {
    const d = hours.find((h) => h.day === DAYS[(now.getDay() + i) % 7]);
    if (d?.open) return `Closed · opens ${d.day} ${fmt(d.open)}`;
  }
  return fallbackCity ? fallbackCity : "Visit us";
}

function AnnouncementBar({ items }: { items: string[] }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setI((p) => (p + 1) % items.length), 3800);
    return () => clearInterval(t);
  }, [items.length]);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--abyss-950)",
        color: "var(--text-on-ocean)",
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        key={i}
        style={{
          font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {items[i]}
      </div>
      {items.length > 1 && (
        <div style={{ position: "absolute", right: 20, display: "flex", gap: 6 }}>
          {items.map((_, n) => (
            <span
              key={n}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: n === i ? "var(--brand-cyan)" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  icon: Icon,
  label,
  badge,
  primary,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  badge?: number;
  primary?: boolean;
}) {
  const [h, setH] = React.useState(false);
  return (
    <button
      aria-label={label}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: "relative",
        width: 42,
        height: 42,
        borderRadius: "var(--radius-full)",
        border: "none",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        background: primary ? "var(--brand-primary)" : h ? "var(--surface-sunken)" : "transparent",
        color: primary ? "var(--text-on-brand)" : "var(--text-heading)",
        transition: "background var(--dur-fast) var(--ease-out)",
      }}
    >
      <Icon size={19} />
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            padding: "0 4px",
            borderRadius: "var(--radius-full)",
            background: primary ? "var(--brand-accent)" : "var(--brand-primary)",
            color: primary ? "var(--ink-950)" : "#fff",
            font: "var(--fw-bold) var(--text-2xs)/18px var(--font-sans)",
            textAlign: "center",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function SiteHeader({
  settings,
  location,
}: {
  settings: SiteSettings | null;
  location: StoreLocation | null;
}) {
  const announcements =
    settings?.announcements && settings.announcements.length
      ? settings.announcements
      : ["Free FedEx overnight on orders over $250", "Live arrival guarantee on every order"];
  const hoursLabel = openStatus(location?.hours, location?.address.city ?? null);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--surface-card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <AnnouncementBar items={announcements} />
      <div style={{ position: "relative", borderBottom: "1px solid var(--border-default)" }}>
        <div
          style={{
            maxWidth: "var(--container-xl)",
            margin: "0 auto",
            padding: "0 var(--gutter)",
            height: 76,
            display: "flex",
            alignItems: "center",
            gap: "var(--space-6)",
          }}
        >
          {/* logo */}
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              cursor: "pointer",
              flex: "none",
              textDecoration: "none",
            }}
          >
            <img
              src="/storefront/logo-fish.png"
              alt="The Fish Tank"
              style={{ width: 60, height: 42, objectFit: "contain" }}
            />
            <div>
              <div
                style={{
                  font: "var(--fw-extra) var(--text-lg)/1 var(--font-display)",
                  color: "var(--text-heading)",
                  letterSpacing: "-0.01em",
                }}
              >
                {settings?.siteTitle || "The Fish Tank"}
              </div>
              <div
                style={{
                  font: "var(--text-2xs)/1 var(--font-sans)",
                  color: "var(--text-muted)",
                  letterSpacing: "var(--tracking-caps)",
                  textTransform: "uppercase",
                  marginTop: 3,
                }}
              >
                {settings?.tagline || "Marine Fish & Coral"}
              </div>
            </div>
          </Link>

          {/* search (visual only this phase) */}
          <div
            style={{
              flex: 1,
              maxWidth: 460,
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <span style={{ position: "absolute", left: 14, color: "var(--text-muted)" }}>
              <Search size={17} />
            </span>
            <input
              placeholder="Search corals, fish, supplies…"
              aria-label="Search"
              style={{
                width: "100%",
                height: "var(--control-lg)",
                padding: "0 14px 0 40px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-full)",
                font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
                color: "var(--text-body)",
                background: "var(--surface-sunken)",
                outline: "none",
              }}
            />
          </div>

          {/* utility icons */}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <IconBtn icon={User} label="Account" />
            <IconBtn icon={Heart} label="Wishlist" />
            <IconBtn icon={ShoppingCart} label="Cart" primary />
          </div>
        </div>

        {/* main nav row */}
        <div
          style={{
            maxWidth: "var(--container-xl)",
            margin: "0 auto",
            padding: "0 var(--gutter)",
            display: "flex",
            alignItems: "stretch",
            gap: "var(--space-1)",
            height: 46,
          }}
        >
          {NAV.map((entry) => (
            <span
              key={entry.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "0 var(--space-4)",
                cursor: "default",
                font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
                color: "var(--text-heading)",
              }}
            >
              {entry.label}
              <ChevronDown size={14} />
            </span>
          ))}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 var(--space-4)",
              font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)",
              color: "var(--status-danger)",
            }}
          >
            Weekly Specials
          </span>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ color: "var(--brand-primary)", display: "inline-flex" }}>
              <MapPin size={15} />
            </span>
            {hoursLabel}
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({
  settings,
  location,
}: {
  settings: SiteSettings | null;
  location: StoreLocation | null;
}) {
  const cols = [
    {
      h: "Shop",
      items: [
        "Live Corals",
        "New Arrivals",
        "Saltwater Fish",
        "Inverts & CUC",
        "Dry Goods",
        "Coral Frag Packs",
      ],
    },
    {
      h: "Learn",
      items: [
        "Care Guides",
        "Acclimation Guide",
        "New to Reefing?",
        "Reef Rewards",
        "The Fish Tank Blog",
      ],
    },
    {
      h: "Support",
      items: ["My Account", "Shipping Policy", "Arrival Guarantee", "Returns & DOA", "Contact Us"],
    },
  ];
  const pay = ["Visa", "Mastercard", "Amex", "PayPal", "Shop Pay", "Apple Pay"];

  const addr = location?.address;
  const napLine = location
    ? [
        location.name,
        [addr?.street, addr?.city && `${addr.city},`, addr?.region, addr?.postal]
          .filter(Boolean)
          .join(" "),
        location.phone,
      ]
        .filter(Boolean)
        .join(" · ")
    : "The Fish Tank";

  const socials: Array<{ key: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "instagram", icon: Instagram },
    { key: "facebook", icon: Facebook },
    { key: "youtube", icon: Youtube },
  ];

  return (
    <footer
      style={{
        background: "var(--grad-ocean)",
        color: "var(--text-on-ocean)",
        marginTop: "var(--space-24)",
      }}
    >
      <div style={{ borderBottom: "1px solid var(--border-ocean)" }}>
        <div
          style={{
            maxWidth: "var(--container-xl)",
            margin: "0 auto",
            padding: "var(--space-12) var(--gutter)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-10)",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                font: "var(--fw-extra) var(--text-3xl)/1.05 var(--font-display)",
                color: "#fff",
              }}
            >
              Get the drop.
            </div>
            <p
              style={{
                font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
                color: "var(--text-on-ocean-muted)",
                marginTop: "var(--space-2)",
              }}
            >
              New arrivals, live-sale alerts, and reef tips — every week.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <input
              placeholder="you@example.com"
              aria-label="Email address"
              style={{
                flex: 1,
                height: "var(--control-lg)",
                padding: "0 16px",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--border-ocean)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                outline: "none",
                font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
              }}
            />
            <button
              style={{
                height: "var(--control-lg)",
                padding: "0 22px",
                border: "none",
                borderRadius: "var(--radius-full)",
                background: "var(--brand-primary)",
                color: "var(--text-on-brand)",
                boxShadow: "var(--glow-blue)",
                cursor: "pointer",
                font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)",
              }}
            >
              Subscribe
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: "var(--container-xl)",
          margin: "0 auto",
          padding: "var(--space-16) var(--gutter) var(--space-10)",
          display: "grid",
          gridTemplateColumns: "1.5fr repeat(3, 1fr)",
          gap: "var(--space-10)",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              marginBottom: "var(--space-4)",
            }}
          >
            <img
              src="/storefront/logo-fish-white.png"
              alt=""
              style={{ width: 64, height: 44, objectFit: "contain" }}
            />
            <div style={{ font: "var(--fw-extra) var(--text-xl)/1 var(--font-display)" }}>
              {settings?.siteTitle || "The Fish Tank"}
            </div>
          </div>
          <p
            style={{
              font: "var(--fw-regular) var(--text-sm)/1.6 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
              maxWidth: 300,
              margin: 0,
            }}
          >
            Northern Utah's home for healthy marine fish and aquacultured corals — hand-selected,
            photographed, and shipped overnight with a live-arrival guarantee.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
            {socials.map(({ key, icon: Icon }) => (
              <div
                key={key}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "var(--radius-full)",
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                <Icon size={18} />
              </div>
            ))}
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <div
              style={{
                font: "var(--fw-bold) var(--text-xs)/1 var(--font-sans)",
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--brand-cyan)",
                marginBottom: "var(--space-4)",
              }}
            >
              {c.h}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {c.items.map((it) => (
                <span
                  key={it}
                  style={{
                    font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
                    color: "var(--text-on-ocean-muted)",
                    cursor: "default",
                  }}
                >
                  {it}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--border-ocean)" }}>
        <div
          style={{
            maxWidth: "var(--container-xl)",
            margin: "0 auto",
            padding: "var(--space-5) var(--gutter)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              font: "var(--fw-regular) var(--text-xs)/1.4 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
            }}
          >
            © {new Date().getFullYear()} {napLine}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {pay.map((p) => (
              <span
                key={p}
                style={{
                  font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
                  color: "var(--text-on-ocean)",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid var(--border-ocean)",
                  padding: "5px 8px",
                  borderRadius: "var(--radius-xs)",
                }}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
