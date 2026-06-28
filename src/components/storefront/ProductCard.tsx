import * as React from "react";
import { Heart, ShoppingCart, CalendarClock } from "lucide-react";

/**
 * The Fish Tank — storefront ProductCard (ported from
 * design-system/components/catalog/ProductCard.jsx → TSX).
 *
 * Reef-livestock tile: photo, vendor/origin, name + scientific name, sale price
 * with struck compare-at, % OFF and WYSIWYG badges, a wishlist toggle, a hover
 * "Add to Cart" affordance, plus three stock states:
 *   - "live"        → in stock, fully orderable.
 *   - "order_ahead" → sold out but sourceable; still looks orderable (full
 *                     color, price, buy affordance) and shows a subtle pickup-ETA
 *                     line. NOT greyed out — it reads as available with a date.
 *   - "sold"        → defensive only (the storefront never passes it: non-
 *                     sourceable sold items never reach v_public_inventory). Keeps
 *                     the legacy greyed-out "Sold Out" treatment.
 *
 * Uses the storefront design tokens (defined under `.tft-storefront` in
 * src/storefront.css). lucide-react replaces the reference's `data-lucide` icons.
 *
 * Cart/wishlist are local UI affordances only this phase (no commerce backend);
 * `onAddToCart` is optional.
 */

const fmt = (n: number) =>
  "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ProductCardProps = {
  image?: string | null;
  name: string;
  vendor?: string | null;
  scientificName?: string | null;
  price: number;
  compareAt?: number | null;
  wysiwyg?: boolean;
  stock?: "live" | "order_ahead" | "sold";
  /** Pickup-ETA copy shown on order-ahead cards (e.g. "Order by Sunday · pickup Wednesday"). */
  etaLine?: string | null;
  badge?: string | null;
  onAddToCart?: () => void;
  onClick?: () => void;
  style?: React.CSSProperties;
};

function Pill({
  tone,
  children,
}: {
  tone: "danger" | "ocean" | "gold";
  children: React.ReactNode;
}) {
  const bg =
    tone === "danger"
      ? "var(--status-danger)"
      : tone === "ocean"
        ? "var(--brand-primary)"
        : "var(--brand-accent)";
  const color = tone === "gold" ? "var(--ink-950)" : "#fff";
  return (
    <span
      style={{
        background: bg,
        color,
        font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        padding: "4px 8px",
        borderRadius: "var(--radius-full)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </span>
  );
}

export function ProductCard({
  image,
  name,
  vendor,
  scientificName,
  price,
  compareAt,
  wysiwyg = false,
  stock = "live",
  etaLine,
  badge,
  onAddToCart,
  onClick,
  style = {},
}: ProductCardProps) {
  const [hover, setHover] = React.useState(false);
  const [wish, setWish] = React.useState(false);
  // Only the legacy non-sourceable "sold" state greys out. order_ahead reads as orderable.
  const sold = stock === "sold";
  const orderAhead = stock === "order_ahead";
  const pct = compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: hover
          ? "var(--ring-hairline), var(--shadow-lg)"
          : "var(--ring-hairline), var(--shadow-sm)",
        transform: hover && !sold ? "translateY(-4px)" : "none",
        transition: "var(--transition-base)",
        cursor: "pointer",
        ...style,
      }}
    >
      {/* IMAGE */}
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          background: "var(--surface-sunken)",
          overflow: "hidden",
        }}
      >
        {image && (
          <img
            src={image}
            alt={name}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: hover && !sold ? "scale(1.06)" : "scale(1)",
              filter: sold ? "grayscale(0.7) brightness(0.9)" : "none",
              transition: "transform var(--dur-slow) var(--ease-out)",
            }}
          />
        )}

        {/* top-left badge stack */}
        <div
          style={{
            position: "absolute",
            top: "var(--space-3)",
            left: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "flex-start",
          }}
        >
          {pct > 0 && !sold && <Pill tone="danger">{pct}% OFF</Pill>}
          {wysiwyg && <Pill tone="ocean">WYSIWYG</Pill>}
          {badge && !sold && <Pill tone="gold">{badge}</Pill>}
        </div>

        {/* wishlist */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setWish((w) => !w);
          }}
          aria-label="Add to wishlist"
          style={{
            position: "absolute",
            top: "var(--space-3)",
            right: "var(--space-3)",
            width: 34,
            height: 34,
            borderRadius: "var(--radius-full)",
            border: "none",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            background: "rgba(255,255,255,0.92)",
            color: wish ? "var(--status-danger)" : "var(--ink-600)",
            boxShadow: "var(--shadow-sm)",
            opacity: hover || wish ? 1 : 0,
            transform: hover || wish ? "translateY(0)" : "translateY(-4px)",
            transition:
              "opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
          }}
        >
          <Heart size={16} fill={wish ? "var(--status-danger)" : "transparent"} />
        </button>

        {/* sold-out overlay */}
        {sold && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: "rgba(13,23,41,0.35)",
            }}
          >
            <span
              style={{
                background: "var(--ink-950)",
                color: "#fff",
                font: "var(--fw-bold) var(--text-xs)/1 var(--font-sans)",
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                padding: "8px 14px",
                borderRadius: "var(--radius-full)",
              }}
            >
              Sold Out
            </span>
          </div>
        )}

        {/* hover add-to-cart */}
        {!sold && (
          <div
            style={{
              position: "absolute",
              left: "var(--space-3)",
              right: "var(--space-3)",
              bottom: "var(--space-3)",
              transform: hover ? "translateY(0)" : "translateY(140%)",
              opacity: hover ? 1 : 0,
              transition:
                "transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart && onAddToCart();
              }}
              style={{
                width: "100%",
                height: "var(--control-md)",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: "var(--brand-primary)",
                color: "var(--text-on-brand)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--glow-blue)",
                font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)",
              }}
            >
              <ShoppingCart size={15} />
              Add to Cart
            </button>
          </div>
        )}
      </div>

      {/* BODY */}
      <div
        style={{
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          flex: 1,
        }}
      >
        {vendor && (
          <div
            style={{
              font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)",
              letterSpacing: "var(--tracking-wide)",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            {vendor}
          </div>
        )}
        <div
          style={{
            font: "var(--fw-bold) var(--text-base)/1.25 var(--font-display)",
            color: "var(--text-heading)",
          }}
        >
          {name}
        </div>
        {scientificName && (
          <div
            style={{
              font: "italic var(--fw-regular) var(--text-sm)/1.3 var(--font-sans)",
              color: "var(--text-muted)",
            }}
          >
            {scientificName}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-2)",
            marginTop: "auto",
            paddingTop: "var(--space-3)",
          }}
        >
          <span
            style={{
              font: "var(--fw-extra) var(--text-lg)/1 var(--font-display)",
              color: pct > 0 ? "var(--status-danger)" : "var(--text-heading)",
            }}
          >
            {fmt(price)}
          </span>
          {pct > 0 && compareAt != null && (
            <span
              style={{
                font: "var(--fw-medium) var(--text-sm)/1 var(--font-sans)",
                color: "var(--text-muted)",
                textDecoration: "line-through",
              }}
            >
              {fmt(compareAt)}
            </span>
          )}
        </div>
        {/* order-ahead pickup ETA — subtle, positive (NOT a sold-out treatment) */}
        {orderAhead && etaLine && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: "var(--space-2)",
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              alignSelf: "flex-start",
              background: "var(--blue-50)",
              color: "var(--brand-primary)",
              font: "var(--fw-semibold) var(--text-2xs)/1.1 var(--font-sans)",
            }}
          >
            <CalendarClock size={12} />
            {etaLine}
          </div>
        )}
      </div>
    </div>
  );
}
