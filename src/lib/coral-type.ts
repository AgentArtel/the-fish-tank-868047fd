// Coral-type classification from a listing title. Vendors rarely fill Shopify's
// product_type (Furnace's is blank), but the type is almost always in the title
// (e.g. "C259 - TSA DAN AYKROYD ACRO"). This is a deterministic keyword pass —
// first match wins, conservative (unmatched → null/"Other"). AI classification
// can refine this later as a draft-only backfill. Pure functions: safe to import
// on both the server (feed/scrape) and the client (UI).

type TypeDef = { slug: string; label: string; re: RegExp };

// Order matters — more specific patterns first.
const TYPES: TypeDef[] = [
  { slug: "euphyllia", label: "Euphyllia", re: /\b(euphyllia|hammer|torch|frogspawn|octospawn)\b/i },
  { slug: "acro", label: "Acropora", re: /\b(acropora|acro|tenuis|millepora|milli|staghorn|tort)\b/i },
  { slug: "monti", label: "Montipora", re: /\b(montipora|monti)\b/i },
  { slug: "chalice", label: "Chalice", re: /\b(chalice|echinophyllia|mycedium|oxypora)\b/i },
  { slug: "acan", label: "Acan / Lord", re: /\b(acanthastrea|acan|micromussa|lordhowensis|lord)\b/i },
  {
    slug: "brain",
    label: "Brain / Favia",
    re: /\b(trachyphyllia|trachy|lobophyllia|lobo|favia|favites|brain|wellso|symphyllia|war coral)\b/i,
  },
  { slug: "zoa", label: "Zoa / Paly", re: /\b(zoanthid|zoa|zoas|palythoa|paly|palys)\b/i },
  { slug: "goni", label: "Goniopora", re: /\b(goniopora|goni|flowerpot|alveopora)\b/i },
  { slug: "mushroom", label: "Mushroom", re: /\b(mushroom|rhodactis|ricordea|discosoma|bounce|yuma)\b/i },
  { slug: "leather", label: "Leather", re: /\b(leather|sarcophyton|sinularia|toadstool)\b/i },
  { slug: "duncan", label: "Duncan", re: /\bduncan\b/i },
  { slug: "cyphastrea", label: "Cyphastrea", re: /\b(cyphastrea|cyph)\b/i },
  { slug: "psammocora", label: "Psammocora", re: /\bpsammocora\b/i },
  { slug: "clam", label: "Clam", re: /\b(clam|tridacna|derasa|crocea|squamosa)\b/i },
  { slug: "anemone", label: "Anemone", re: /\b(anemone|nem|bubble tip|bta|rbta|rock flower)\b/i },
];

export function classifyCoralType(title?: string | null): string | null {
  if (!title) return null;
  for (const t of TYPES) if (t.re.test(title)) return t.slug;
  return null;
}

const LABELS: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.slug, t.label]));

export function coralTypeLabel(slug?: string | null): string {
  return slug ? (LABELS[slug] ?? slug) : "Other";
}

// For populating filter dropdowns.
export const CORAL_TYPES: Array<{ slug: string; label: string }> = TYPES.map((t) => ({
  slug: t.slug,
  label: t.label,
}));
