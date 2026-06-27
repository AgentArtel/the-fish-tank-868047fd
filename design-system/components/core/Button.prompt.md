Brand call-to-action button — use for any primary or secondary action; coral is the default brand fill, gold/ocean for emphasis, outline/ghost for low-priority actions.

```jsx
<Button variant="primary" size="lg" leftIcon={<Fish />}>Browse live stock</Button>
<Button variant="outline">View details</Button>
<Button variant="gold" size="sm">Hold this coral</Button>
```

Variants: `primary` (coral), `gold`, `ocean`, `secondary`, `outline`, `ghost`, `link`. Sizes: `sm`, `md`, `lg`. Pass `fullWidth` for full-width CTAs, `as="a"` + `href` for link buttons, and icons via `leftIcon` / `rightIcon` (ReactNode). Hover lifts the button 1px and darkens the fill.
