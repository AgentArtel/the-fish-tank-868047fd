// The Fish Tank — site chrome: announcement bar, header w/ mega-menu, footer
const { Button: ChromeButton, Badge: ChromeBadge } = window.TheFishTankDesignSystem_a2acac;

/* ---------------- Announcement bar ---------------- */
function AnnouncementBar() {
  const items = window.TFT_DATA.announcements;
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % items.length), 3800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ background: "var(--abyss-950)", color: "var(--text-on-ocean)", height: 38, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
      <div style={{ font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)", display: "flex", alignItems: "center", gap: 8, transition: "opacity var(--dur-base) var(--ease-out)" }} key={i}>
        {items[i]}
      </div>
      <div style={{ position: "absolute", right: 20, display: "flex", gap: 6 }}>
        {items.map((_, n) => (
          <span key={n} style={{ width: 6, height: 6, borderRadius: "50%", background: n === i ? "var(--brand-cyan)" : "rgba(255,255,255,0.25)" }} />
        ))}
      </div>
    </div>
  );
}

/* ---------------- Mega-menu header ---------------- */
function MegaPanel({ entry, go }) {
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface-card)",
      borderTop: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)", zIndex: 60,
    }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-8) var(--gutter)", display: "grid", gridTemplateColumns: "repeat(3, 1fr) 280px", gap: "var(--space-8)" }}>
        {entry.columns.map((col) => (
          <div key={col.head}>
            <div style={{ font: "var(--fw-bold) var(--text-xs)/1 var(--font-sans)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--brand-primary)", marginBottom: "var(--space-4)" }}>{col.head}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {col.items.map((it) => (
                <a key={it} onClick={() => go("catalog")} className="mega-link"
                  style={{ font: "var(--type-small)", color: "var(--text-secondary)", cursor: "pointer", width: "fit-content" }}>{it}</a>
              ))}
            </div>
          </div>
        ))}
        <div onClick={() => go("catalog")} style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", cursor: "pointer", minHeight: 180 }}>
          <img src={entry.featured.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "var(--scrim-bottom)" }} />
          <div style={{ position: "absolute", left: "var(--space-4)", bottom: "var(--space-4)", color: "#fff" }}>
            <div style={{ font: "var(--fw-bold) var(--text-lg)/1.1 var(--font-display)" }}>{entry.featured.title}</div>
            <div style={{ font: "var(--type-caption)", color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{entry.featured.sub}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SiteHeader({ route, go, cartCount, onCart }) {
  const nav = window.TFT_DATA.nav;
  const [open, setOpen] = React.useState(null);
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--surface-card)", boxShadow: "var(--shadow-sm)" }}>
      <AnnouncementBar />
      <div onMouseLeave={() => setOpen(null)} style={{ position: "relative", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "0 var(--gutter)", height: 76, display: "flex", alignItems: "center", gap: "var(--space-6)" }}>
          {/* logo */}
          <div onClick={() => go("home")} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer", flex: "none" }}>
            <img src="../../assets/logo-fish.png" alt="The Fish Tank" style={{ width: 60, height: 42, objectFit: "contain" }} />
            <div>
              <div style={{ font: "var(--fw-extra) var(--text-lg)/1 var(--font-display)", color: "var(--text-heading)", letterSpacing: "-0.01em" }}>The Fish Tank</div>
              <div style={{ font: "var(--text-2xs)/1 var(--font-sans)", color: "var(--text-muted)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", marginTop: 3 }}>Marine Fish &amp; Coral</div>
            </div>
          </div>

          {/* search */}
          <div style={{ flex: 1, maxWidth: 460, position: "relative", display: "flex", alignItems: "center" }}>
            <i data-lucide="search" style={{ position: "absolute", left: 14, width: 17, height: 17, color: "var(--text-muted)" }}></i>
            <input placeholder="Search corals, fish, supplies…" style={{
              width: "100%", height: "var(--control-lg)", padding: "0 14px 0 40px", border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-full)", font: "var(--type-small)", color: "var(--text-body)", background: "var(--surface-sunken)", outline: "none",
            }} />
          </div>

          {/* utility icons */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <IconBtn icon="user" label="Account" />
            <IconBtn icon="heart" label="Wishlist" badge={3} />
            <IconBtn icon="shopping-cart" label="Cart" badge={cartCount} onClick={onCart} primary />
          </div>
        </div>

        {/* main nav row */}
        <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "0 var(--gutter)", display: "flex", alignItems: "stretch", gap: "var(--space-1)", height: 46 }}>
          {nav.map((entry) => (
            <div key={entry.key} onMouseEnter={() => setOpen(entry.key)}
              onClick={() => go("catalog")}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 var(--space-4)", cursor: "pointer",
                font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)",
                color: open === entry.key ? "var(--brand-primary)" : "var(--text-heading)",
                boxShadow: open === entry.key ? "inset 0 -2px 0 var(--brand-primary)" : "none",
                transition: "color var(--dur-fast) var(--ease-out)" }}>
              {entry.label}
              <i data-lucide="chevron-down" style={{ width: 14, height: 14 }}></i>
            </div>
          ))}
          <div onClick={() => go("catalog")} style={{ display: "flex", alignItems: "center", padding: "0 var(--space-4)", cursor: "pointer", font: "var(--fw-bold) var(--text-sm)/1 var(--font-sans)", color: "var(--status-danger)" }}>
            Weekly Specials
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, font: "var(--type-small)", color: "var(--text-secondary)" }}>
            <i data-lucide="map-pin" style={{ width: 15, height: 15, color: "var(--brand-primary)" }}></i>
            {window.TFT_HOURS ? window.TFT_HOURS() : "Sandy, UT"}
          </div>
        </div>

        {open && <MegaPanel entry={nav.find((n) => n.key === open)} go={go} />}
      </div>
    </header>
  );
}

function IconBtn({ icon, label, badge, onClick, primary }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} aria-label={label} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: "relative", width: 42, height: 42, borderRadius: "var(--radius-full)", border: "none", cursor: "pointer",
        display: "grid", placeItems: "center",
        background: primary ? "var(--brand-primary)" : (h ? "var(--surface-sunken)" : "transparent"),
        color: primary ? "var(--text-on-brand)" : "var(--text-heading)", transition: "background var(--dur-fast) var(--ease-out)" }}>
      <i data-lucide={icon} style={{ width: 19, height: 19 }}></i>
      {badge > 0 && (
        <span style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 4px", borderRadius: "var(--radius-full)",
          background: primary ? "var(--brand-accent)" : "var(--brand-primary)", color: primary ? "var(--ink-950)" : "#fff",
          font: "var(--fw-bold) var(--text-2xs)/18px var(--font-sans)", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>{badge}</span>
      )}
    </button>
  );
}

/* ---------------- Footer ---------------- */
function SiteFooter({ go }) {
  const cols = [
    { h: "Shop", items: ["Live Corals", "New Arrivals", "Saltwater Fish", "Inverts & CUC", "Dry Goods", "Coral Frag Packs"] },
    { h: "Learn", items: ["Care Guides", "Acclimation Guide", "New to Reefing?", "Reef Rewards", "The Fish Tank Blog"] },
    { h: "Support", items: ["My Account", "Shipping Policy", "Arrival Guarantee", "Returns & DOA", "Contact Us"] },
  ];
  const pay = ["Visa", "Mastercard", "Amex", "PayPal", "Shop Pay", "Apple Pay"];
  return (
    <footer style={{ background: "var(--grad-ocean)", color: "var(--text-on-ocean)", marginTop: "var(--space-24)" }}>
      {/* newsletter band */}
      <div style={{ borderBottom: "1px solid var(--border-ocean)" }}>
        <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--gutter)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-10)", alignItems: "center" }}>
          <div>
            <div style={{ font: "var(--fw-extra) var(--text-3xl)/1.05 var(--font-display)", color: "#fff" }}>Get the drop.</div>
            <p style={{ font: "var(--type-lead)", color: "var(--text-on-ocean-muted)", marginTop: "var(--space-2)" }}>New arrivals, live-sale alerts, and reef tips — every week.</p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <input placeholder="you@example.com" style={{ flex: 1, height: "var(--control-lg)", padding: "0 16px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-ocean)", background: "rgba(255,255,255,0.06)", color: "#fff", outline: "none", font: "var(--type-small)" }} />
            <ChromeButton variant="primary" size="lg">Subscribe</ChromeButton>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-16) var(--gutter) var(--space-10)", display: "grid", gridTemplateColumns: "1.5fr repeat(3, 1fr)", gap: "var(--space-10)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
            <img src="../../assets/logo-fish-white.png" alt="" style={{ width: 64, height: 44, objectFit: "contain" }} />
            <div style={{ font: "var(--fw-extra) var(--text-xl)/1 var(--font-display)" }}>The Fish Tank</div>
          </div>
          <p style={{ font: "var(--type-small)", color: "var(--text-on-ocean-muted)", maxWidth: 300, margin: 0 }}>
            Northern Utah's home for healthy marine fish and aquacultured corals — hand-selected, photographed, and shipped overnight with a live-arrival guarantee.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
            {["instagram", "facebook", "youtube"].map((s) => (
              <div key={s} style={{ width: 38, height: 38, borderRadius: "var(--radius-full)", display: "grid", placeItems: "center", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer" }}>
                <i data-lucide={s} style={{ width: 18, height: 18 }}></i>
              </div>
            ))}
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <div style={{ font: "var(--fw-bold) var(--text-xs)/1 var(--font-sans)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--brand-cyan)", marginBottom: "var(--space-4)" }}>{c.h}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {c.items.map((it) => <a key={it} onClick={() => go("catalog")} style={{ font: "var(--type-small)", color: "var(--text-on-ocean-muted)", cursor: "pointer" }}>{it}</a>)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--border-ocean)" }}>
        <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-5) var(--gutter)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <span style={{ font: "var(--type-caption)", color: "var(--text-on-ocean-muted)" }}>© 2026 The Fish Tank · 8371 700 W, Sandy, UT 84070 · (801) 887-7000</span>
          <div style={{ display: "flex", gap: 6 }}>
            {pay.map((p) => (
              <span key={p} style={{ font: "var(--fw-bold) var(--text-2xs)/1 var(--font-sans)", color: "var(--text-on-ocean)", background: "rgba(255,255,255,0.10)", border: "1px solid var(--border-ocean)", padding: "5px 8px", borderRadius: "var(--radius-xs)" }}>{p}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { SiteHeader, SiteFooter });
