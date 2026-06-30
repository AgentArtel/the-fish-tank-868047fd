import ReactMarkdown from "react-markdown";

/**
 * Storefront markdown renderer. Renders the trusted, admin-authored `body_md` /
 * `answer_md` / `description_md` from the v_public_* views with react-markdown
 * (no raw dangerouslySetInnerHTML). Elements are styled with the storefront
 * design-system tokens (inline `var(--...)`) to match the PDP/Catalog idiom —
 * react-markdown emits plain HTML elements, so we map the common ones here.
 */
export function Markdown({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  return (
    <ReactMarkdown
      components={{
        p: ({ node, ...props }) => (
          <p
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.7 var(--font-sans)",
              color: "var(--text-secondary)",
              margin: "0 0 var(--space-5)",
            }}
            {...props}
          />
        ),
        h2: ({ node, ...props }) => (
          <h2
            style={{
              font: "var(--fw-bold) var(--text-2xl)/1.2 var(--font-display)",
              color: "var(--text-heading)",
              margin: "var(--space-8) 0 var(--space-4)",
            }}
            {...props}
          />
        ),
        h3: ({ node, ...props }) => (
          <h3
            style={{
              font: "var(--fw-bold) var(--text-xl)/1.25 var(--font-display)",
              color: "var(--text-heading)",
              margin: "var(--space-6) 0 var(--space-3)",
            }}
            {...props}
          />
        ),
        a: ({ node, ...props }) => (
          <a style={{ color: "var(--brand-primary)", fontWeight: 600 }} {...props} />
        ),
        ul: ({ node, ...props }) => (
          <ul
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.7 var(--font-sans)",
              color: "var(--text-secondary)",
              margin: "0 0 var(--space-5)",
              paddingLeft: "var(--space-6)",
            }}
            {...props}
          />
        ),
        ol: ({ node, ...props }) => (
          <ol
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.7 var(--font-sans)",
              color: "var(--text-secondary)",
              margin: "0 0 var(--space-5)",
              paddingLeft: "var(--space-6)",
            }}
            {...props}
          />
        ),
        li: ({ node, ...props }) => <li style={{ margin: "0 0 var(--space-2)" }} {...props} />,
        blockquote: ({ node, ...props }) => (
          <blockquote
            style={{
              borderLeft: "3px solid var(--brand-primary)",
              paddingLeft: "var(--space-4)",
              margin: "0 0 var(--space-5)",
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
            {...props}
          />
        ),
        code: ({ node, ...props }) => (
          <code
            style={{
              font: "var(--text-sm)/1.5 var(--font-mono)",
              background: "var(--surface-sunken)",
              borderRadius: "var(--radius-xs)",
              padding: "1px 5px",
            }}
            {...props}
          />
        ),
        img: ({ node, ...props }) => (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            loading="lazy"
            style={{
              maxWidth: "100%",
              borderRadius: "var(--radius-lg)",
              margin: "var(--space-4) 0",
            }}
            {...props}
          />
        ),
        hr: () => (
          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border-default)",
              margin: "var(--space-8) 0",
            }}
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
