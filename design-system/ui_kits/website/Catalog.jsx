// The Fish Tank — Collection / catalog page with filter sidebar
const { Button: CBtn, Badge: CBadge, ProductCard: CProductCard, Select: CSelect } = window.TheFishTankDesignSystem_a2acac;

function FilterGroup({ title, options, value, onChange, multi }) {
  return (
    <div style={{ paddingBottom: "var(--space-5)", marginBottom: "var(--space-5)", borderBottom: "1px solid var(--border-default)" }}>
      <div style={{ font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)", color: "var(--text-heading)", marginBottom: "var(--space-3)" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {options.map((o) => {
          const active = multi ? value.includes(o.key) : value === o.key;
          return (
            <label key={o.key} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", font: "var(--type-small)", color: active ? "var(--text-heading)" : "var(--text-secondary)" }}>
              <span style={{ width: 16, height: 16, borderRadius: multi ? "var(--radius-xs)" : "var(--radius-full)", border: active ? "none" : "1.5px solid var(--border-strong)", background: active ? "var(--brand-primary)" : "transparent", display: "grid", placeItems: "center", flex: "none" }}>
                {active && <i data-lucide="check" style={{ width: 11, height: 11, color: "#fff" }}></i>}
              </span>
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.count != null && <span style={{ font: "var(--text-2xs)/1 var(--font-mono)", color: "var(--text-muted)" }}>{o.count}</span>}
              <input type={multi ? "checkbox" : "radio"} checked={active} onChange={() => onChange(o.key)} style={{ display: "none" }} />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Catalog({ go, addToCart }) {
  const all = window.TFT_DATA.products;
  const [type, setType] = React.useState("all");
  const [care, setCare] = React.useState([]);
  const [onSale, setOnSale] = React.useState(false);
  const [sort, setSort] = React.useState("featured");

  let items = all.filter((p) =>
    (type === "all" || p.type === type) &&
    (care.length === 0 || care.includes(p.care)) &&
    (!onSale || p.compareAt)
  );
  if (sort === "price-asc") items = [...items].sort((a, b) => a.price - b.price);
  if (sort === "price-desc") items = [...items].sort((a, b) => b.price - a.price);

  const toggleCare = (k) => setCare((c) => c.includes(k) ? c.filter((x) => x !== k) : [...c, k]);
  const typeOpts = [
    { key: "all", label: "All Livestock", count: all.length },
    { key: "coral", label: "Corals", count: all.filter((p) => p.type === "coral").length },
    { key: "fish", label: "Saltwater Fish", count: all.filter((p) => p.type === "fish").length },
    { key: "invert", label: "Inverts & CUC", count: all.filter((p) => p.type === "invert").length },
  ];
  const careOpts = [
    { key: "Easy", label: "Beginner" }, { key: "Moderate", label: "Intermediate" }, { key: "Expert", label: "Expert" },
  ];

  return (
    <div>
      {/* collection header */}
      <section style={{ background: "var(--grad-ocean)", color: "var(--text-on-ocean)" }}>
        <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--gutter)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--type-small)", color: "var(--text-on-ocean-muted)", marginBottom: "var(--space-3)" }}>
            <a onClick={() => go("home")} style={{ cursor: "pointer" }}>Home</a>
            <i data-lucide="chevron-right" style={{ width: 14, height: 14 }}></i>
            <span style={{ color: "var(--brand-cyan)" }}>Live Stock</span>
          </div>
          <h1 style={{ font: "var(--fw-extra) var(--text-5xl)/1 var(--font-display)", color: "#fff", margin: 0 }}>Live Stock Catalog</h1>
          <p style={{ font: "var(--type-lead)", color: "var(--text-on-ocean-muted)", marginTop: "var(--space-3)", maxWidth: 540 }}>
            Everything swimming and growing at the shop right now — photographed under reef lighting. What you see is what ships.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-10) var(--gutter) 0", display: "grid", gridTemplateColumns: "248px 1fr", gap: "var(--space-10)", alignItems: "start" }}>
        {/* sidebar */}
        <aside style={{ position: "sticky", top: 130 }}>
          <div style={{ font: "var(--fw-bold) var(--text-xs)/1 var(--font-sans)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-4)" }}>Filters</div>
          <FilterGroup title="Category" options={typeOpts} value={type} onChange={setType} />
          <FilterGroup title="Care Level" options={careOpts} value={care} onChange={toggleCare} multi />
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}>
            <span style={{ width: 38, height: 22, borderRadius: "var(--radius-full)", background: onSale ? "var(--brand-primary)" : "var(--sand-300)", position: "relative", transition: "background var(--dur-fast) var(--ease-out)", flex: "none" }}>
              <span style={{ position: "absolute", top: 2, left: onSale ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "var(--shadow-sm)", transition: "left var(--dur-fast) var(--ease-out)" }} />
            </span>
            <span style={{ font: "var(--type-small)", color: "var(--text-heading)" }}>On sale only</span>
            <input type="checkbox" checked={onSale} onChange={() => setOnSale((v) => !v)} style={{ display: "none" }} />
          </label>
        </aside>

        {/* grid */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-5)" }}>
            <span style={{ font: "var(--type-small)", color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-heading)" }}>{items.length}</strong> products</span>
            <div style={{ width: 200 }}>
              <CSelect value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="featured">Sort: Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </CSelect>
            </div>
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "var(--space-20)", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", boxShadow: "var(--ring-hairline)" }}>
              <i data-lucide="search-x" style={{ width: 40, height: 40, color: "var(--text-muted)" }}></i>
              <div style={{ font: "var(--type-h4)", marginTop: 12 }}>No products match these filters</div>
              <p style={{ font: "var(--type-small)", color: "var(--text-muted)", marginTop: 6 }}>Try clearing a filter — new arrivals land weekly.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-5)", paddingBottom: "var(--space-8)" }}>
              {items.map((p) => (
                <CProductCard key={p.id} image={p.img} vendor={p.vendor} name={p.name} scientificName={p.sci}
                  price={p.price} compareAt={p.compareAt} wysiwyg={p.wysiwyg} stock={p.stock}
                  onClick={() => go("product", p)} onAddToCart={() => addToCart(p)} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
Object.assign(window, { Catalog });
