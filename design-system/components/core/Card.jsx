import React from "react";

/**
 * The Fish Tank — Card surface.
 * Warm white panel with hairline border + soft elevation. Optional
 * "ocean" tone for dark sections, and hoverable lift.
 */
export function Card({
  children,
  tone = "light",
  elevation = "sm",
  hoverable = false,
  padding = "var(--space-6)",
  style = {},
  ...props
}) {
  const [hover, setHover] = React.useState(false);
  const shadows = {
    none: "var(--ring-hairline)",
    sm: "var(--ring-hairline), var(--shadow-sm)",
    md: "var(--ring-hairline), var(--shadow-md)",
    lg: "var(--shadow-lg)",
  };
  const isOcean = tone === "ocean";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: isOcean ? "var(--surface-ocean-raised)" : "var(--surface-card)",
        color: isOcean ? "var(--text-on-ocean)" : "var(--text-body)",
        borderRadius: "var(--radius-lg)",
        boxShadow: isOcean
          ? "inset 0 0 0 1px var(--border-ocean)"
          : (hoverable && hover ? "var(--ring-hairline), var(--shadow-lg)" : shadows[elevation]),
        padding,
        transition: "var(--transition-base)",
        transform: hoverable && hover ? "translateY(-3px)" : "none",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/** Optional structured header for a Card. */
export function CardHeader({ title, subtitle, action, style = {}, ...props }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-4)", ...style }} {...props}>
      <div>
        {title && <div style={{ font: "var(--type-h4)", color: "inherit" }}>{title}</div>}
        {subtitle && <div style={{ font: "var(--type-small)", color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
