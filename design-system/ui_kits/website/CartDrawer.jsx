// The Fish Tank — slide-out cart drawer
const { Button: CartBtn } = window.TheFishTankDesignSystem_a2acac;
const cfmt = (n) => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CartDrawer({ open, items, onClose, onQty, onRemove, go }) {
  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const freeThreshold = 250;
  const toFree = Math.max(0, freeThreshold - subtotal);
  const pctFree = Math.min(100, (subtotal / freeThreshold) * 100);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: open ? "auto" : "none" }}>
      {/* scrim */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(13,23,41,0.5)", opacity: open ? 1 : 0, transition: "opacity var(--dur-base) var(--ease-out)" }} />
      {/* panel */}
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "92vw", background: "var(--surface-page)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform var(--dur-base) var(--ease-out)" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ font: "var(--type-h4)", color: "var(--text-heading)" }}>Your Cart ({items.reduce((s, it) => s + it.qty, 0)})</div>
          <button onClick={onClose} aria-label="Close cart" style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", border: "none", background: "var(--surface-sunken)", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--text-heading)" }}>
            <i data-lucide="x" style={{ width: 18, height: 18 }}></i>
          </button>
        </div>

        {/* free-shipping meter */}
        {items.length > 0 && (
          <div style={{ padding: "var(--space-4) var(--space-6)", background: "var(--blue-50)", borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)", marginBottom: 8 }}>
              {toFree > 0 ? <span>Add <strong style={{ color: "var(--brand-primary)" }}>{cfmt(toFree)}</strong> for free overnight shipping</span> : <span style={{ color: "var(--status-success)" }}>🎉 You've unlocked free overnight shipping!</span>}
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--sand-200)", overflow: "hidden" }}>
              <div style={{ width: pctFree + "%", height: "100%", background: "var(--brand-primary)", transition: "width var(--dur-base) var(--ease-out)" }} />
            </div>
          </div>
        )}

        {/* items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-4) var(--space-6)" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "var(--space-16) 0", color: "var(--text-muted)" }}>
              <i data-lucide="shopping-cart" style={{ width: 40, height: 40 }}></i>
              <div style={{ font: "var(--type-h4)", color: "var(--text-heading)", marginTop: 12 }}>Your cart is empty</div>
              <p style={{ font: "var(--type-small)", marginTop: 6 }}>Add some corals and they'll show up here.</p>
              <CartBtn variant="primary" style={{ marginTop: 16 }} onClick={() => { onClose(); go("catalog"); }}>Browse live stock</CartBtn>
            </div>
          ) : items.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border-default)" }}>
              <img src={it.img} alt="" style={{ width: 70, height: 70, borderRadius: "var(--radius-md)", objectFit: "cover", flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "var(--fw-bold) var(--text-sm)/1.2 var(--font-display)", color: "var(--text-heading)" }}>{it.name}</div>
                <div style={{ font: "var(--text-2xs)/1 var(--font-sans)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", marginTop: 3 }}>{it.vendor}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--space-2)" }}>
                  {/* qty stepper */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                    <button onClick={() => onQty(it.id, -1)} style={{ width: 26, height: 26, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-heading)", display: "grid", placeItems: "center" }}><i data-lucide="minus" style={{ width: 13, height: 13 }}></i></button>
                    <span style={{ minWidth: 22, textAlign: "center", font: "var(--fw-semibold) var(--text-sm)/1 var(--font-mono)", color: "var(--text-heading)" }}>{it.qty}</span>
                    <button onClick={() => onQty(it.id, 1)} style={{ width: 26, height: 26, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-heading)", display: "grid", placeItems: "center" }}><i data-lucide="plus" style={{ width: 13, height: 13 }}></i></button>
                  </div>
                  <span style={{ font: "var(--fw-extra) var(--text-base)/1 var(--font-display)", color: "var(--text-heading)" }}>{cfmt(it.price * it.qty)}</span>
                </div>
              </div>
              <button onClick={() => onRemove(it.id)} aria-label="Remove" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", alignSelf: "flex-start" }}>
                <i data-lucide="trash-2" style={{ width: 16, height: 16 }}></i>
              </button>
            </div>
          ))}
        </div>

        {/* footer / checkout */}
        {items.length > 0 && (
          <div style={{ padding: "var(--space-5) var(--space-6)", borderTop: "1px solid var(--border-default)", background: "var(--surface-card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
              <span style={{ font: "var(--type-body)", color: "var(--text-secondary)" }}>Subtotal</span>
              <span style={{ font: "var(--fw-extra) var(--text-xl)/1 var(--font-display)", color: "var(--text-heading)" }}>{cfmt(subtotal)}</span>
            </div>
            <p style={{ font: "var(--type-caption)", color: "var(--text-muted)", margin: "0 0 var(--space-4)" }}>Shipping &amp; taxes calculated at checkout.</p>
            <CartBtn variant="primary" size="lg" fullWidth rightIcon={<i data-lucide="arrow-right"></i>}>Checkout</CartBtn>
            <button onClick={onClose} style={{ width: "100%", marginTop: "var(--space-3)", border: "none", background: "transparent", cursor: "pointer", font: "var(--fw-semibold) var(--text-sm)/1 var(--font-sans)", color: "var(--text-secondary)" }}>Continue shopping</button>
          </div>
        )}
      </div>
    </div>
  );
}
Object.assign(window, { CartDrawer });
