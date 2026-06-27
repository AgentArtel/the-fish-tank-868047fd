import React from "react";
import { Badge } from "../core/Badge.jsx";

/**
 * The Fish Tank — ProductCard
 * Production-style reef e-commerce livestock tile: photo, vendor, name +
 * scientific name, sale price with struck compare-at, % OFF and WYSIWYG
 * badges, a wishlist toggle, a hover "Add to Cart" action, and a sold-out
 * state. Mirrors the card pattern used across modern reef storefronts.
 */
const fmt = (n) =>
  "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ProductCard({
  image,
  name,
  vendor,
  scientificName,
  price,
  compareAt,
  wysiwyg = false,
  stock = "live",
  badge,
  onAddToCart,
  onClick,
  style = {},
  ...props
}) {
  const [hover, setHover] = React.useState(false);
  const [wish, setWish] = React.useState(false);
  const sold = stock === "sold";
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
        boxShadow: hover ? "var(--ring-hairline), var(--shadow-lg)" : "var(--ring-hairline), var(--shadow-sm)",
        transform: hover && !sold ? "translateY(-4px)" : "none",
        transition: "var(--transition-base)",
        cursor: "pointer",
        ...style,
      }}
      {...props}
    >
      {/* IMAGE */}
      <div style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-sunken)", overflow: "hidden" }}>
        {image && (
          <img src={image} alt={name} loading="lazy"
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              transform: hover && !sold ? "scale(1.06)" : "scale(1)",
              filter: sold ? "grayscale(0.7) brightness(0.9)" : "none",
              transition: "transform var(--dur-slow) var(--ease-out)",
            }} />
        )}

        {/* top-left badge stack */}
        <div style={{ position: "absolute", top: "var(--space-3)", left: "var(--space-3)", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          {pct > 0 && !sold && <Badge tone="danger" variant="solid" size="sm">{pct}% OFF</Badge>}
          {wysiwyg && <Badge tone="ocean" variant="solid" size="sm">WYSIWYG</Badge>}
          {badge && !sold && <Badge tone="gold" variant="solid" size="sm">{badge}</Badge>}
        </div>

        {/* wishlist */}
        <button
          onClick={(e) => { e.stopPropagation(); setWish((w) => !w); }}
          aria-label="Add to wishlist"
          style={{
            position: "absolute", top: "var(--space-3)", right: "var(--space-3)",
            width: 34, height: 34, borderRadius: "var(--radius-full)", border: "none",
            display: "grid", placeItems: "center", cursor: "pointer",
            background: "rgba(255,255,255,0.92)", color: wish ? "var(--status-danger)" : "var(--ink-600)",
            boxShadow: "var(--shadow-sm)",
            opacity: hover || wish ? 1 : 0, transform: hover || wish ? "translateY(0)" : "translateY(-4px)",
            transition: "opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
          }}>
          <i data-lucide="heart" style={{ width: 16, height: 16, fill: wish ? "var(--status-danger)" : "transparent" }}></i>
        </button>

        {/* sold-out overlay */}
        {sold && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(13,23,41,0.35)" }}>
            <span style={{ background: "var(--ink-950)", color: "#fff", font: "var(--fw-bold) var(--text-xs)/1 var(--font-sans)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", padding: "8px 14px", borderRadius: "var(--radius-full)" }}>Sold Out</span>
          </div>
        )}

        {/* hover add-to-cart */}
        {!sold && (
          <div style={{
            position: "absolute", left: "var(--space-3)", right: "var(--space-3)", bottom: "var(--space-3)",
            transform: hover ? "translateY(0)" : "translateY(140%)", opacity: hover ? 1 : 0,
            transition: "transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)",
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(); }}
              style={{
                width: "100%", height: "var(--control-md)", border: "none", cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "var(--brand-primary)", color: "var(--text-on-brand)",
                borderRadius: "var(--radius-md)", boxShadow: "var(--glow-blue)",
                font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)",
              }}>
              <i data-lucide="shopping-cart" style={{ width: 15, height: 15 }}></i>
              Add to Cart
            </button>
          </div>
        )}
      </div>

      {/* BODY */}
      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
        {vendor && (
          <div style={{ font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", color: "var(--text-muted)" }}>{vendor}</div>
        )}
        <div style={{ font: "var(--fw-bold) var(--text-base)/1.25 var(--font-display)", color: "var(--text-heading)" }}>{name}</div>
        {scientificName && (
          <div style={{ font: "italic var(--fw-regular) var(--text-sm)/1.3 var(--font-sans)", color: "var(--text-muted)" }}>{scientificName}</div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", marginTop: "auto", paddingTop: "var(--space-3)" }}>
          <span style={{ font: "var(--fw-extra) var(--text-lg)/1 var(--font-display)", color: pct > 0 ? "var(--status-danger)" : "var(--text-heading)" }}>{fmt(price)}</span>
          {pct > 0 && (
            <span style={{ font: "var(--fw-medium) var(--text-sm)/1 var(--font-sans)", color: "var(--text-muted)", textDecoration: "line-through" }}>{fmt(compareAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
