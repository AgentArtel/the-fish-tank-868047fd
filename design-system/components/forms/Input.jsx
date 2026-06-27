import React from "react";

/**
 * The Fish Tank — Input
 * Text field with optional leading icon, label and hint. Coral focus ring.
 */
export function Input({
  label,
  hint,
  error,
  leftIcon = null,
  id,
  style = {},
  containerStyle = {},
  ...props
}) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const borderColor = error ? "var(--status-danger)" : focus ? "var(--ring)" : "var(--border-strong)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", ...containerStyle }}>
      {label && (
        <label htmlFor={inputId} style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{label}</label>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {leftIcon && (
          <span style={{ position: "absolute", left: "var(--space-3)", display: "inline-flex", color: "var(--text-muted)", pointerEvents: "none" }}>{leftIcon}</span>
        )}
        <input
          id={inputId}
          onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
          style={{
            width: "100%",
            height: "var(--control-md)",
            padding: leftIcon ? "0 var(--space-3) 0 calc(var(--space-3) + 22px)" : "0 var(--space-3)",
            font: "var(--type-body)",
            color: "var(--text-body)",
            background: "var(--surface-card)",
            border: `1px solid ${borderColor}`,
            borderRadius: "var(--radius-sm)",
            outline: "none",
            boxShadow: focus ? "0 0 0 3px rgba(21,116,224,0.22)" : "none",
            transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
            ...style,
          }}
          {...props}
        />
      </div>
      {(hint || error) && (
        <span style={{ font: "var(--type-caption)", color: error ? "var(--status-danger)" : "var(--text-muted)" }}>{error || hint}</span>
      )}
    </div>
  );
}
