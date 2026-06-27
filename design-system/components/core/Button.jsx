import React from "react";

/**
 * The Fish Tank — Button
 * Brand button with coral/gold/ocean fills, outline & ghost styles.
 * Styling is driven entirely by design-system CSS custom properties.
 */
const SIZES = {
  sm: { height: "var(--control-sm)", padding: "0 var(--space-3)", font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)", gap: "var(--space-2)", radius: "var(--radius-sm)" },
  md: { height: "var(--control-md)", padding: "0 var(--space-4)", font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)", gap: "var(--space-2)", radius: "var(--radius-md)" },
  lg: { height: "var(--control-lg)", padding: "0 var(--space-6)", font: "var(--fw-bold) var(--text-base)/1 var(--font-sans)", gap: "var(--space-2)", radius: "var(--radius-md)" },
};

const VARIANTS = {
  primary:   { background: "var(--brand-primary)", color: "var(--text-on-brand)", border: "1px solid transparent", boxShadow: "var(--shadow-sm)" },
  gold:      { background: "var(--brand-accent)", color: "var(--text-on-accent)", border: "1px solid transparent", boxShadow: "var(--shadow-sm)" },
  ocean:     { background: "var(--brand-deep)", color: "var(--text-on-ocean)", border: "1px solid transparent", boxShadow: "var(--shadow-sm)" },
  secondary: { background: "var(--surface-sunken)", color: "var(--text-heading)", border: "1px solid var(--border-default)", boxShadow: "none" },
  outline:   { background: "transparent", color: "var(--text-heading)", border: "1px solid var(--border-strong)", boxShadow: "none" },
  ghost:     { background: "transparent", color: "var(--text-heading)", border: "1px solid transparent", boxShadow: "none" },
  link:      { background: "transparent", color: "var(--brand-primary)", border: "1px solid transparent", boxShadow: "none", textDecoration: "underline", textUnderlineOffset: "3px", padding: 0, height: "auto" },
};

const HOVER = {
  primary:   "var(--brand-primary-hover)",
  gold:      "var(--yellow-600)",
  ocean:     "var(--royal-900)",
  secondary: "var(--sand-200)",
  outline:   "var(--surface-sunken)",
  ghost:     "var(--surface-sunken)",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  leftIcon = null,
  rightIcon = null,
  fullWidth = false,
  disabled = false,
  as = "button",
  style = {},
  ...props
}) {
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const [hover, setHover] = React.useState(false);
  const Comp = as;

  const base = {
    display: fullWidth ? "flex" : "inline-flex",
    width: fullWidth ? "100%" : undefined,
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    height: v.height ?? s.height,
    padding: v.padding ?? s.padding,
    borderRadius: s.radius,
    font: s.font,
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
    transform: hover && !disabled && variant !== "link" ? "translateY(-1px)" : "none",
    ...v,
    background: hover && !disabled && HOVER[variant] ? HOVER[variant] : v.background,
    ...style,
  };

  return (
    <Comp
      style={base}
      disabled={Comp === "button" ? disabled : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </Comp>
  );
}
