// The Fish Tank — Home / storefront landing
const { Button: HBtn, Badge: HBadge, ProductCard: HProductCard } = window.TheFishTankDesignSystem_a2acac;

function Hero({ go }) {
  return (
    <section style={{ position: "relative", background: "var(--grad-ocean)", color: "var(--text-on-ocean)", overflow: "hidden" }}>
      <img src="../../assets/wave-dark.png" alt="" style={{ position: "absolute", left: "-5%", bottom: -50, width: "110%", opacity: 0.45, pointerEvents: "none" }} />
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-16) var(--gutter)", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: "var(--space-10)", alignItems: "center", position: "relative" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", padding: "6px 12px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.08)", border: "1px solid var(--border-ocean)", font: "var(--type-caption)", color: "var(--brand-cyan)", marginBottom: "var(--space-5)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand-cyan)" }} />
            Fresh corals & fish arriving weekly · acclimated in Sandy
          </div>
          <h1 style={{ font: "var(--fw-extra) var(--text-6xl)/0.98 var(--font-display)", letterSpacing: "var(--tracking-tight)", color: "#fff", margin: 0 }}>
            The reef,<br />delivered.
          </h1>
          <p style={{ font: "var(--type-lead)", color: "var(--text-on-ocean-muted)", maxWidth: 460, marginTop: "var(--space-5)" }}>
            Hand-selected saltwater fish and aquacultured corals — photographed under reef lighting and shipped overnight with our 5-day arrival guarantee.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-8)" }}>
            <HBtn variant="primary" size="lg" rightIcon={<i data-lucide="arrow-right"></i>} onClick={() => go("catalog")}>Shop live stock</HBtn>
            <HBtn variant="gold" size="lg" onClick={() => go("catalog")}>Weekly specials</HBtn>
          </div>
          <div style={{ display: "flex", gap: "var(--space-8)", marginTop: "var(--space-10)" }}>
            {[["700+", "Items in stock"], ["100%", "Aquacultured corals"], ["5-day", "Arrival guarantee"]].map(([n, l]) => (
              <div key={l}>
                <div style={{ font: "var(--fw-extra) var(--text-3xl)/1 var(--font-display)", color: "var(--brand-cyan)" }}>{n}</div>
                <div style={{ font: "var(--type-caption)", color: "var(--text-on-ocean-muted)", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", background: "var(--glow-blue)", filter: "blur(24px)", opacity: 0.7 }} />
          <img src="../../assets/logo-fish-white.png" alt="Blue tang" style={{ position: "relative", width: "100%", maxWidth: 500, filter: "drop-shadow(0 24px 48px rgba(3,7,15,0.6))" }} />
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  return (
    <section style={{ background: "var(--surface-card)", borderBottom: "1px solid var(--border-default)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-6) var(--gutter)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-6)" }}>
        {window.TFT_DATA.trust.map((t) => (
          <div key={t.title} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div style={{ width: 42, height: 42, borderRadius: "var(--radius-full)", background: "var(--blue-50)", color: "var(--brand-primary)", display: "grid", placeItems: "center", flex: "none" }}>
              <i data-lucide={t.icon} style={{ width: 20, height: 20 }}></i>
            </div>
            <div>
              <div style={{ font: "var(--fw-bold) var(--text-sm)/1.2 var(--font-sans)", color: "var(--text-heading)" }}>{t.title}</div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 2 }}>{t.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryStrip({ go }) {
  return (
    <section style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-16) var(--gutter) 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-5)" }}>
        {window.TFT_DATA.categories.map((c) => (
          <div key={c.key} onClick={() => go("catalog")} className="cat-tile" style={{ position: "relative", borderRadius: "var(--radius-xl)", overflow: "hidden", aspectRatio: "1 / 0.82", cursor: "pointer", boxShadow: "var(--shadow-md)" }}>
            <img src={c.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "var(--scrim-bottom)" }} />
            <div style={{ position: "absolute", left: "var(--space-4)", bottom: "var(--space-4)", right: "var(--space-4)", color: "#fff" }}>
              <i data-lucide={c.icon} style={{ width: 22, height: 22, marginBottom: 6 }}></i>
              <div style={{ font: "var(--fw-bold) var(--text-xl)/1.1 var(--font-display)" }}>{c.label}</div>
              <div style={{ font: "var(--type-caption)", color: "rgba(255,255,255,0.82)", marginTop: 2 }}>{c.count} in stock</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductRow({ eyebrow, title, items, go, addToCart, accent }) {
  return (
    <section style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-16) var(--gutter) 0" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "var(--space-8)" }}>
        <div>
          <div className="tft-eyebrow" style={{ marginBottom: 8, color: accent || "var(--brand-primary)" }}>{eyebrow}</div>
          <h2 style={{ font: "var(--type-h2)" }}>{title}</h2>
        </div>
        <HBtn variant="ghost" rightIcon={<i data-lucide="arrow-right"></i>} onClick={() => go("catalog")}>Shop all</HBtn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-5)" }}>
        {items.map((p) => (
          <HProductCard key={p.id} image={p.img} vendor={p.vendor} name={p.name} scientificName={p.sci}
            price={p.price} compareAt={p.compareAt} wysiwyg={p.wysiwyg} stock={p.stock}
            onClick={() => go("product", p)} onAddToCart={() => addToCart(p)} />
        ))}
      </div>
    </section>
  );
}

function PromoBand({ go }) {
  return (
    <section style={{ maxWidth: "var(--container-xl)", margin: "var(--space-16) auto 0", padding: "0 var(--gutter)" }}>
      <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius-2xl)", background: "var(--grad-brand)", color: "#fff", padding: "var(--space-12) var(--space-16)", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--space-8)", alignItems: "center" }}>
        <div>
          <div style={{ font: "var(--fw-bold) var(--text-xs)/1 var(--font-sans)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", opacity: 0.9, marginBottom: 10 }}>Reef Rewards</div>
          <h2 style={{ font: "var(--fw-extra) var(--text-4xl)/1.04 var(--font-display)", color: "#fff", margin: 0 }}>Earn 5% back on every coral you take home.</h2>
          <p style={{ font: "var(--type-lead)", color: "rgba(255,255,255,0.9)", marginTop: "var(--space-4)", maxWidth: 460 }}>
            Members get early access to new arrivals, live-sale invites, and points on every order. Free to join.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
            <HBtn variant="gold" size="lg">Join Reef Rewards</HBtn>
            <HBtn variant="ghost" size="lg" style={{ color: "#fff" }}>How it works</HBtn>
          </div>
        </div>
        <div style={{ display: "grid", placeItems: "center" }}>
          <img src="../../assets/logo-fish-white.png" alt="" style={{ width: "100%", maxWidth: 300, filter: "drop-shadow(0 16px 32px rgba(3,7,15,0.45))" }} />
        </div>
      </div>
    </section>
  );
}

function LocationBlock() {
  const s = window.TFT_DATA.site;
  const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()];
  const fmt = (t) => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2,"0")}${ap}` : `${h}${ap}`; };
  return (
    <section style={{ maxWidth: "var(--container-xl)", margin: "var(--space-16) auto 0", padding: "0 var(--gutter)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-10)", alignItems: "stretch" }}>
        <div>
          <div className="tft-eyebrow" style={{ marginBottom: 8 }}>Visit the showroom</div>
          <h2 style={{ font: "var(--type-h2)" }}>Utah's saltwater fish &amp; coral store</h2>
          <p style={{ font: "var(--type-lead)", color: "var(--text-secondary)", marginTop: "var(--space-3)", maxWidth: 480 }}>
            Five minutes off I-15 in Sandy, our reef showroom holds 60+ display systems of
            hand-selected corals, fish, and inverts — proudly serving reef-keepers across the
            Salt Lake Valley and the Wasatch Front since day one.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <i data-lucide="map-pin" style={{ width: 18, height: 18, color: "var(--brand-primary)" }}></i>
              <span style={{ font: "var(--type-body)", color: "var(--text-body)" }}>{s.address.street}, {s.address.city}, {s.address.region} {s.address.postal}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <i data-lucide="phone" style={{ width: 18, height: 18, color: "var(--brand-primary)" }}></i>
              <a href={s.phoneHref} style={{ font: "var(--type-body)", color: "var(--text-body)" }}>{s.phone}</a>
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
            <HBtn variant="primary" leftIcon={<i data-lucide="navigation"></i>}>Get directions</HBtn>
            <HBtn variant="outline" leftIcon={<i data-lucide="phone"></i>} as="a" href={s.phoneHref}>Call the shop</HBtn>
          </div>
          <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: "var(--space-5)" }}>
            Serving {s.serviceAreas.slice(0, 6).join(" · ")} &amp; the greater Salt Lake Valley
          </div>
        </div>
        <div style={{ background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--ring-hairline), var(--shadow-sm)", padding: "var(--space-6) var(--space-8)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
            <div style={{ font: "var(--type-h4)", color: "var(--text-heading)" }}>Store Hours</div>
            <span style={{ font: "var(--type-caption)", color: "var(--status-success)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-success)" }} />
              {window.TFT_HOURS()}
            </span>
          </div>
          {s.hours.map((h) => (
            <div key={h.day} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border-default)",
              font: h.day === dayName ? "var(--fw-bold) var(--text-base)/1 var(--font-sans)" : "var(--type-body)",
              color: h.day === dayName ? "var(--text-heading)" : "var(--text-secondary)" }}>
              <span>{({Sun:"Sunday",Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday",Sat:"Saturday"})[h.day]}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(h.open)} – {fmt(h.close)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Home({ go, addToCart }) {
  const P = window.TFT_DATA.products;
  const specials = P.filter((p) => p.compareAt).slice(0, 4);
  const arrivals = P.filter((p) => p.type === "coral").slice(0, 4);
  const fish = P.filter((p) => p.type === "fish").slice(0, 4);
  return (
    <div>
      <Hero go={go} />
      <TrustBar />
      <CategoryStrip go={go} />
      <ProductRow eyebrow="Save big this week" title="Weekly Specials" items={specials} go={go} addToCart={addToCart} accent="var(--status-danger)" />
      <ProductRow eyebrow="Fresh on the floor" title="New Arrivals" items={arrivals} go={go} addToCart={addToCart} accent="var(--brand-ocean)" />
      <PromoBand go={go} />
      <ProductRow eyebrow="Overnight, reef-safe" title="Fresh Saltwater Fish" items={fish} go={go} addToCart={addToCart} />
      <LocationBlock />
    </div>
  );
}
Object.assign(window, { Home });
