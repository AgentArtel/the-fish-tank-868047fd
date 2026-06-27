// The Fish Tank — Product detail (Daylight/Actinic toggle, sale, add-to-cart)
const { Button: PBtn, Badge: PBadge } = window.TheFishTankDesignSystem_a2acac;
const pfmt = (n) => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Spec({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border-default)" }}>
      <div style={{ width: 34, height: 34, borderRadius: "var(--radius-md)", background: "var(--blue-50)", display: "grid", placeItems: "center", color: "var(--brand-primary)", flex: "none" }}>
        <i data-lucide={icon} style={{ width: 17, height: 17 }}></i>
      </div>
      <span style={{ font: "var(--type-small)", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ marginLeft: "auto", font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)", color: "var(--text-heading)" }}>{value}</span>
    </div>
  );
}

function Product({ go, product, addToCart }) {
  const p = product || window.TFT_DATA.products[0];
  const [view, setView] = React.useState("daylight"); // daylight | actinic
  const sold = p.stock === "sold";
  const pct = p.compareAt && p.compareAt > p.price ? Math.round((1 - p.price / p.compareAt) * 100) : 0;
  const more = window.TFT_DATA.products.filter((x) => x.type === p.type && x.id !== p.id).slice(0, 4);
  const { ProductCard: RP } = window.TheFishTankDesignSystem_a2acac;

  return (
    <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-8) var(--gutter) 0" }}>
      {/* breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", font: "var(--type-small)", color: "var(--text-muted)", marginBottom: "var(--space-6)" }}>
        <a onClick={() => go("home")} style={{ cursor: "pointer" }}>Home</a>
        <i data-lucide="chevron-right" style={{ width: 14, height: 14 }}></i>
        <a onClick={() => go("catalog")} style={{ cursor: "pointer" }}>Live Stock</a>
        <i data-lucide="chevron-right" style={{ width: 14, height: 14 }}></i>
        <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-10)" }}>
        {/* gallery */}
        <div>
          <div style={{ position: "relative", borderRadius: "var(--radius-xl)", overflow: "hidden", aspectRatio: "1/1", boxShadow: "var(--shadow-md)", background: view === "actinic" ? "var(--abyss-950)" : "var(--surface-sunken)" }}>
            <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", filter: view === "actinic" ? "saturate(1.5) hue-rotate(200deg) brightness(0.85) contrast(1.15)" : "none", transition: "filter var(--dur-base) var(--ease-out)" }} />
            <div style={{ position: "absolute", top: "var(--space-4)", left: "var(--space-4)", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              {pct > 0 && !sold && <PBadge tone="danger" variant="solid">{pct}% OFF</PBadge>}
              {p.wysiwyg && <PBadge tone="ocean" variant="solid">WYSIWYG</PBadge>}
            </div>
            {/* daylight / actinic toggle */}
            <div style={{ position: "absolute", bottom: "var(--space-4)", left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, padding: 4, borderRadius: "var(--radius-full)", background: "rgba(13,23,41,0.65)", backdropFilter: "blur(8px)" }}>
              {[["daylight", "Daylight"], ["actinic", "Actinic"]].map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} style={{ border: "none", cursor: "pointer", padding: "6px 14px", borderRadius: "var(--radius-full)", font: "var(--fw-semibold) var(--text-xs)/1 var(--font-sans)", background: view === k ? "#fff" : "transparent", color: view === k ? "var(--ink-950)" : "#fff" }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            {[p.img, "../../assets/placeholders/reef-1.jpg", "../../assets/placeholders/reef-6.jpg", "../../assets/placeholders/reef-8.jpg"].map((src, i) => (
              <div key={i} style={{ borderRadius: "var(--radius-md)", overflow: "hidden", aspectRatio: "1/1", cursor: "pointer", boxShadow: i === 0 ? "0 0 0 2px var(--brand-primary)" : "var(--ring-hairline)" }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        </div>

        {/* details */}
        <div>
          <div style={{ font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>{p.vendor}</div>
          <h1 style={{ font: "var(--fw-extra) var(--text-4xl)/1.04 var(--font-display)" }}>{p.name}</h1>
          <div style={{ font: "italic var(--text-lg)/1.2 var(--font-sans)", color: "var(--text-muted)", marginTop: 4 }}>{p.sci}</div>

          {/* reviews row */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            <span style={{ display: "inline-flex", gap: 1, color: "var(--brand-accent)" }}>
              {[0,1,2,3,4].map((s) => <i key={s} data-lucide="star" style={{ width: 15, height: 15, fill: "var(--brand-accent)" }}></i>)}
            </span>
            <span style={{ font: "var(--type-caption)", color: "var(--text-muted)" }}>4.9 · 128 reviews</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
            <span style={{ font: "var(--fw-extra) var(--text-4xl)/1 var(--font-display)", color: pct > 0 ? "var(--status-danger)" : "var(--text-heading)" }}>{pfmt(p.price)}</span>
            {pct > 0 && <span style={{ font: "var(--fw-medium) var(--text-lg)/1 var(--font-sans)", color: "var(--text-muted)", textDecoration: "line-through" }}>{pfmt(p.compareAt)}</span>}
            {pct > 0 && <PBadge tone="danger" variant="soft">Save {pct}%</PBadge>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: "var(--space-3)", font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)", color: sold ? "var(--text-muted)" : "var(--status-success)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: sold ? "var(--text-muted)" : "var(--status-success)" }} />
            {sold ? "Sold out — check back soon" : "In stock · ready to ship overnight"}
          </div>

          <p style={{ font: "var(--type-lead)", color: "var(--text-secondary)", marginTop: "var(--space-5)" }}>
            A standout {p.cat.toLowerCase()} acclimated and eating in our system. {p.wysiwyg ? "This is a WYSIWYG specimen — the exact one pictured is the one you'll receive." : "Photographed in-store under reef lighting."}
          </p>

          <div style={{ margin: "var(--space-6) 0" }}>
            <Spec icon="heart-pulse" label="Care level" value={p.care} />
            <Spec icon="shield-check" label="Reef compatibility" value={p.reef} />
            <Spec icon="droplets" label="Placement" value={p.type === "coral" ? "Low–Medium flow" : "—"} />
            <Spec icon="map-pin" label="Location" value="Sandy showroom · Tank C-12" />
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <PBtn variant="primary" size="lg" fullWidth leftIcon={<i data-lucide="shopping-cart"></i>} disabled={sold} onClick={() => !sold && addToCart(p)}>
              {sold ? "Sold out" : "Add to cart · " + pfmt(p.price)}
            </PBtn>
            <PBtn variant="outline" size="lg" leftIcon={<i data-lucide="heart"></i>}>Save</PBtn>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-4)", font: "var(--type-caption)", color: "var(--text-muted)" }}>
            <i data-lucide="shield-check" style={{ width: 15, height: 15 }}></i>
            Covered by our 5-day reef-safe arrival guarantee · Free FedEx overnight over $250
          </div>
        </div>
      </div>

      {/* related */}
      <div style={{ marginTop: "var(--space-16)" }}>
        <h2 style={{ font: "var(--type-h3)", marginBottom: "var(--space-6)" }}>You may also like</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-5)" }}>
          {more.map((x) => (
            <RP key={x.id} image={x.img} vendor={x.vendor} name={x.name} scientificName={x.sci}
              price={x.price} compareAt={x.compareAt} wysiwyg={x.wysiwyg} stock={x.stock}
              onClick={() => go("product", x)} onAddToCart={() => addToCart(x)} />
          ))}
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { Product });
