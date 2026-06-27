import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Check, SearchX } from "lucide-react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { Product, ProductSort } from "@/lib/public-site.functions";

/**
 * Storefront catalog view — ported from design-system/reference/Catalog.tsx.txt.
 *
 * Shared by /shop (all live stock + filters) and /collections/$slug (a
 * collection's products; filter UI hidden — the collection's own query governs).
 * react-router → TanStack (Link), data-lucide → lucide-react, DS Select →
 * a native styled <select>. The composite `--type-*` tokens from the reference
 * don't exist in storefront.css, so this uses the same granular
 * `var(--fw-*) var(--text-*)/lh var(--font-*)` shorthand as the PDP.
 *
 * This is presentation only: the routes own the loader/head()/JSON-LD and pass
 * products + paging state down. Filter/sort/page changes are driven through URL
 * search params by the parent (so SSR + back/forward stay correct).
 */

export const CATALOG_PAGE_SIZE = 24;

export type CatalogFilterState = {
  type: string; // "all" | "coral" | "fish" | "invert"
  onSale: boolean;
  sort: ProductSort;
};

export type CatalogViewProps = {
  title: string;
  blurb: string;
  /** Breadcrumb leaf label shown in the hero (e.g. "Live Stock" or the collection title). */
  crumb: string;
  products: Product[];
  total: number;
  page: number;
  onPage: (page: number) => void;
  /** When set, the filter sidebar renders and these drive /shop's URL search. Omit for collections. */
  filters?: CatalogFilterState;
  onFilters?: (next: Partial<CatalogFilterState>) => void;
  /** subtle "updating…" hint while a new page/filter is fetching. */
  isFetching?: boolean;
};

const CATEGORY_OPTIONS = [
  { key: "all", label: "All Livestock" },
  { key: "coral", label: "Corals" },
  { key: "fish", label: "Saltwater Fish" },
  { key: "invert", label: "Inverts & CUC" },
];

export function CatalogView({
  title,
  blurb,
  crumb,
  products,
  total,
  page,
  onPage,
  filters,
  onFilters,
  isFetching = false,
}: CatalogViewProps) {
  const showFilters = !!filters && !!onFilters;

  return (
    <div>
      {/* collection / catalog header */}
      <section style={{ background: "var(--grad-ocean)", color: "var(--text-on-ocean)" }}>
        <div
          style={{
            maxWidth: "var(--container-xl)",
            margin: "0 auto",
            padding: "var(--space-12) var(--gutter)",
          }}
        >
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
              marginBottom: "var(--space-3)",
            }}
          >
            <Link to="/" style={{ color: "var(--text-on-ocean-muted)", textDecoration: "none" }}>
              Home
            </Link>
            <ChevronRight size={14} />
            <span style={{ color: "var(--brand-cyan)" }}>{crumb}</span>
          </nav>
          <h1
            style={{
              font: "var(--fw-extra) var(--text-4xl)/1.04 var(--font-display)",
              color: "#fff",
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              font: "var(--fw-regular) var(--text-lg)/1.5 var(--font-sans)",
              color: "var(--text-on-ocean-muted)",
              marginTop: "var(--space-3)",
              maxWidth: 560,
            }}
          >
            {blurb}
          </p>
        </div>
      </section>

      <section
        style={{
          maxWidth: "var(--container-xl)",
          margin: "0 auto",
          padding: "var(--space-10) var(--gutter) 0",
          display: "grid",
          gridTemplateColumns: showFilters ? "248px 1fr" : "1fr",
          gap: "var(--space-10)",
          alignItems: "start",
        }}
      >
        {showFilters && (
          <aside style={{ position: "sticky", top: 130 }}>
            <FilterGroup
              title="Category"
              value={filters!.type}
              onChange={(v) => onFilters!({ type: v })}
              options={CATEGORY_OPTIONS}
            />
            <Toggle
              label="On sale only"
              on={filters!.onSale}
              onChange={() => onFilters!({ onSale: !filters!.onSale })}
            />
          </aside>
        )}

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--space-5)",
              gap: "var(--space-3)",
            }}
          >
            <span
              style={{
                font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
                color: "var(--text-secondary)",
              }}
            >
              <strong style={{ color: "var(--text-heading)" }}>{total}</strong>{" "}
              {total === 1 ? "product" : "products"}
              {isFetching && (
                <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>updating…</span>
              )}
            </span>
            {showFilters && (
              <div style={{ width: 200 }}>
                <SortSelect value={filters!.sort} onChange={(sort) => onFilters!({ sort })} />
              </div>
            )}
          </div>

          {products.length === 0 ? (
            <EmptyState
              title="No products to show yet"
              body="Nothing's flagged for the website right now — new arrivals get photographed and listed weekly. Check back soon."
            />
          ) : (
            <>
              <Grid>
                {products.map((p) => (
                  <Link
                    key={p.id}
                    to="/products/$slug"
                    params={{ slug: p.slug }}
                    style={{ textDecoration: "none" }}
                  >
                    <ProductCard
                      image={p.images[0]?.url}
                      vendor={p.originRegion}
                      name={p.name}
                      scientificName={p.scientificName}
                      price={p.price ?? 0}
                      compareAt={p.compareAtPrice}
                      wysiwyg={p.isWysiwyg}
                      stock={p.availability === "sold" ? "sold" : "live"}
                    />
                  </Link>
                ))}
              </Grid>
              {total > CATALOG_PAGE_SIZE && (
                <Pagination page={page} total={total} onPage={onPage} />
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* ---------------- filter UI ---------------- */
function FilterGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      style={{
        paddingBottom: "var(--space-5)",
        marginBottom: "var(--space-5)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <div
        style={{
          font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)",
          color: "var(--text-heading)",
          marginBottom: "var(--space-3)",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {options.map((o) => {
          const active = value === o.key;
          return (
            <label
              key={o.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                cursor: "pointer",
                font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
                color: active ? "var(--text-heading)" : "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "var(--radius-full)",
                  border: active ? "none" : "1.5px solid var(--border-strong)",
                  background: active ? "var(--brand-primary)" : "transparent",
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                {active && <Check size={11} color="#fff" />}
              </span>
              {o.label}
              <input
                type="radio"
                checked={active}
                onChange={() => onChange(o.key)}
                style={{ display: "none" }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 38,
          height: 22,
          borderRadius: "var(--radius-full)",
          background: on ? "var(--brand-primary)" : "var(--sand-300)",
          position: "relative",
          transition: "background var(--dur-fast) var(--ease-out)",
          flex: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "var(--shadow-sm)",
            transition: "left var(--dur-fast) var(--ease-out)",
          }}
        />
      </span>
      <span
        style={{
          font: "var(--fw-regular) var(--text-sm)/1 var(--font-sans)",
          color: "var(--text-heading)",
        }}
      >
        {label}
      </span>
      <input type="checkbox" checked={on} onChange={onChange} style={{ display: "none" }} />
    </label>
  );
}

function SortSelect({
  value,
  onChange,
}: {
  value: ProductSort;
  onChange: (v: ProductSort) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ProductSort)}
      style={{
        width: "100%",
        height: "var(--control-md)",
        padding: "0 12px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-card)",
        color: "var(--text-heading)",
        font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
        cursor: "pointer",
      }}
    >
      <option value="featured">Sort: Featured</option>
      <option value="price-asc">Price: Low to High</option>
      <option value="price-desc">Price: High to Low</option>
      <option value="newest">Newest</option>
    </select>
  );
}

/* ---------------- layout bits ---------------- */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "var(--space-5)",
        paddingBottom: "var(--space-8)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "var(--space-16)",
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--ring-hairline)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", color: "var(--text-muted)" }}>
        <SearchX size={40} />
      </div>
      <div
        style={{
          font: "var(--fw-bold) var(--text-xl)/1.2 var(--font-display)",
          color: "var(--text-heading)",
          marginTop: 12,
        }}
      >
        {title}
      </div>
      <p
        style={{
          font: "var(--fw-regular) var(--text-sm)/1.5 var(--font-sans)",
          color: "var(--text-muted)",
          marginTop: 6,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.ceil(total / CATALOG_PAGE_SIZE);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "var(--space-2)",
        paddingBottom: "var(--space-12)",
      }}
    >
      {Array.from({ length: pages }).map((_, i) => (
        <button
          key={i}
          onClick={() => onPage(i)}
          style={{
            width: 38,
            height: 38,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            background: i === page ? "var(--brand-primary)" : "var(--surface-card)",
            color: i === page ? "var(--text-on-brand)" : "var(--text-heading)",
            font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
          }}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
