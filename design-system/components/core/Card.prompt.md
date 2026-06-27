Surface container for grouped content. `light` (default) is a warm white panel with hairline border + soft shadow; `ocean` is a dark raised panel for use inside dark sections. Use `CardHeader` for a title/subtitle/action row.

```jsx
<Card hoverable elevation="md">
  <CardHeader title="Reef Club" subtitle="Member rewards" action={<Button size="sm" variant="outline">Manage</Button>} />
  <p>…</p>
</Card>

<Card tone="ocean"><p>Dark section panel</p></Card>
```

Props: `tone` (light/ocean), `elevation` (none/sm/md/lg), `hoverable`, `padding`.
