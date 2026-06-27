import React from "react";

/**
 * The Fish Tank — Badge / pill label.
 * Solid, soft (tinted) and outline tones for categories, status and stock.
 */
const TONES = {
  blue:    { solid: ["var(--brand-primary)", "var(--text-on-brand)"], soft: ["var(--blue-50)", "var(--blue-700)"] },
  cyan:    { solid: ["var(--brand-cyan)", "var(--ink-950)"],          soft: ["var(--cyan-200)", "var(--royal-700)"] },
  gold:    { solid: ["var(--brand-accent)", "var(--text-on-accent)"], soft: ["var(--status-warning-bg)", "var(--yellow-600)"] },
  ocean:   { solid: ["var(--brand-deep)", "var(--text-on-ocean)"],    soft: ["var(--status-info-bg)", "var(--blue-700)"] },
  neutral: { solid: ["var(--ink-900)", "var(--sand-50)"],             soft: ["var(--surface-sunken)", "var(--text-secondary)"] },
  success: { solid: ["var(--status-success)", "#fff"],                soft: ["var(--status-success-bg)", "var(--status-success)"] },
  warning: { solid: ["var(--status-warning)", "#fff"],                soft: ["var(--status-warning-bg)", "var(--status-warning)"] },
  danger:  { solid: ["var(--status-danger)", "#fff"],                 soft: ["var(--status-danger-bg)", "var(--status-danger)"] },
};

export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  size = "md",
  dot = false,
  style = {},
  ...props
}) {
  const t = TONES[tone] || TONES.neutral;
  const isOutline = variant === "outline";
  const [bg, fg] = variant === "solid" ? t.solid : t.soft;

  const sizes = {
    sm: { font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)", padding: "3px 7px", gap: "5px" },
    md: { font: "var(--fw-semibold) var(--text-xs)/1 var(--font-sans)", padding: "4px 10px", gap: "6px" },
  };
  const sz = sizes[size] || sizes.md;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sz.gap,
        padding: sz.padding,
        borderRadius: "var(--radius-full)",
        font: sz.font,
        letterSpacing: "0.02em",
        background: isOutline ? "transparent" : bg,
        color: isOutline ? "var(--text-secondary)" : fg,
        border: isOutline ? "1px solid var(--border-strong)" : "1px solid transparent",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...props}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: isOutline ? "var(--text-muted)" : fg, flex: "none" }} />
      )}
      {children}
    </span>
  );
}
