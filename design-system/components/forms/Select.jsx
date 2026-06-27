import React from "react";

/**
 * The Fish Tank — Select (styled native select).
 * Coral focus ring, custom chevron, optional label + hint.
 */
export function Select({
  label,
  hint,
  error,
  id,
  children,
  style = {},
  containerStyle = {},
  ...props
}) {
  const [focus, setFocus] = React.useState(false);
  const selId = id || (label ? `sel-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const borderColor = error ? "var(--status-danger)" : focus ? "var(--ring)" : "var(--border-strong)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", ...containerStyle }}>
      {label && (
        <label htmlFor={selId} style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{label}</label>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <select
          id={selId}
          onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
          style={{
            width: "100%",
            height: "var(--control-md)",
            padding: "0 calc(var(--space-3) + 18px) 0 var(--space-3)",
            font: "var(--type-body)",
            color: "var(--text-body)",
            background: "var(--surface-card)",
            border: `1px solid ${borderColor}`,
            borderRadius: "var(--radius-sm)",
            outline: "none",
            appearance: "none",
            cursor: "pointer",
            boxShadow: focus ? "0 0 0 3px rgba(21,116,224,0.22)" : "none",
            transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
            ...style,
          }}
          {...props}
        >
          {children}
        </select>
        <span style={{ position: "absolute", right: "var(--space-3)", pointerEvents: "none", color: "var(--text-muted)", fontSize: 12 }}>▾</span>
      </div>
      {(hint || error) && (
        <span style={{ font: "var(--type-caption)", color: error ? "var(--status-danger)" : "var(--text-muted)" }}>{error || hint}</span>
      )}
    </div>
  );
}
