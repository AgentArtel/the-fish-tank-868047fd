The signature reef e-commerce livestock tile — photo, a public sourcing/brand label, name + scientific name, sale price with struck compare-at, a **% OFF** badge, a wishlist toggle, a hover **Add to Cart** action, and a sold-out state. (A **WYSIWYG** badge is supported for future use.) Always pass a real `image` (nothing goes live without a photo). Icons use Lucide — call `lucide.createIcons()` after render.

```jsx
<ProductCard
  image="/assets/torch.jpg"
  vendor="Aquacultured"
  name="Gold Torch Coral"
  scientificName="Euphyllia glabrescens"
  price={95.00}
  compareAt={140.00}
  stock="live"
  onAddToCart={() => addToCart(item)}
  onClick={() => goToProduct(item)}
/>
```

`compareAt` higher than `price` renders a red **% OFF** badge + struck price. `stock="sold"` greys the photo and shows a Sold Out overlay (hides Add to Cart). Lay these out in a responsive grid (2 → 4 columns).

> **`vendor` is a PUBLIC label only** — sourcing ("Aquacultured", "Tank-Raised") or a public house brand. **Never** pass the wholesale vendor; that's admin-only and is excluded from the public read model entirely. **`wysiwyg`** is a future capability — leave it off until that workflow ships.
