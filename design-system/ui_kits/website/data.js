// The Fish Tank — sample storefront data (production reef e-commerce style)
// NOTE: In production this is fetched from Supabase, not hard-coded. The shapes
// here mirror the public API contract documented in /data/DATA_MODEL.md and the
// JSON Schemas in /data/schemas/. `site` ↔ site_settings, `products` ↔ the
// public_products read model, etc. — so the live site auto-updates from the workspace.
const PH = "../../assets/placeholders/";
window.TFT_DATA = {
  // ---- Single source of NAP / hours (site_settings) ----
  site: {
    name: "The Fish Tank",
    tagline: "Utah's Saltwater Fish & Coral Store",
    address: { street: "8371 700 W", city: "Sandy", region: "UT", postal: "84070", country: "US" },
    geo: { lat: 40.5897, lng: -111.9013 },
    phone: "(801) 887-7000",
    phoneHref: "tel:+18018877000",
    email: "hello@thefishtank.com",
    serviceAreas: ["Sandy", "Salt Lake City", "Draper", "South Jordan", "West Jordan", "Midvale", "Lehi", "Murray", "Cottonwood Heights"],
    // 0=Sun … 6=Sat
    hours: [
      { day: "Sun", open: "11:00", close: "16:00" },
      { day: "Mon", open: "11:30", close: "20:00" },
      { day: "Tue", open: "11:30", close: "20:00" },
      { day: "Wed", open: "11:30", close: "20:00" },
      { day: "Thu", open: "11:30", close: "20:00" },
      { day: "Fri", open: "11:30", close: "20:00" },
      { day: "Sat", open: "11:00", close: "18:00" },
    ],
  },

  // top utility bar rotating value props
  announcements: [
    "🛡️  5-Day Reef-Safe Arrival Guarantee",
    "📦  Free FedEx Overnight on livestock orders over $250",
    "🌟  Earn 5% back in Reef Rewards on every order",
    "🏬  Visit our Sandy, Utah showroom — 8371 700 W",
  ],

  // ---- Public-safe product fields only ----
  // The `vendor` field below carries PUBLIC SOURCING labels (Aquacultured /
  // Tank-Raised / Maricultured / Wild-Sourced) — NEVER the wholesale vendor.
  // The real public_products read model excludes vendor & cost entirely.
  // `wysiwyg` stays false everywhere until that workflow ships.

  // mega-menu structure
  nav: [
    {
      key: "corals", label: "Live Corals",
      columns: [
        { head: "Shop by Type", items: ["SPS Corals", "LPS Corals", "Soft Corals", "Zoanthids", "Mushrooms", "Acropora"] },
        { head: "Top Picks", items: ["New Arrivals", "Tank's Picks", "Coral Frag Packs", "Coral Colonies", "Aquacultured"] },
        { head: "By Care Level", items: ["Beginner Corals", "Intermediate", "Expert Only", "Coming Soon"] },
      ],
      featured: { img: PH + "reef-5.jpg", title: "Fresh Arrivals", sub: "New corals every week" },
    },
    {
      key: "fish", label: "Saltwater Fish",
      columns: [
        { head: "Popular", items: ["Tangs", "Clownfish", "Wrasses", "Angelfish", "Gobies", "Anthias"] },
        { head: "Shop by Need", items: ["Reef Safe", "Reef Safe w/ Caution", "Nano Fish", "Beginner Fish", "Aquacultured"] },
      ],
      featured: { img: PH + "reef-2.jpg", title: "Tank-Raised Clowns", sub: "Hardy & reef-ready" },
    },
    {
      key: "inverts", label: "Inverts & CUC",
      columns: [
        { head: "Clean-Up Crew", items: ["Snails", "Hermit Crabs", "Cleaner Shrimp", "Urchins", "Invert Packs"] },
        { head: "Featured", items: ["Anemones", "Sea Stars", "Decorative Shrimp"] },
      ],
      featured: { img: PH + "reef-7.jpg", title: "CUC Packs", sub: "From $34.99" },
    },
    {
      key: "supplies", label: "Dry Goods",
      columns: [
        { head: "Equipment", items: ["Lighting", "Protein Skimmers", "Powerheads", "Return Pumps", "Controllers", "Heaters"] },
        { head: "Care & Food", items: ["Coral Food", "Fish Food", "Supplements", "Coral Dips", "Water Testing"] },
        { head: "Tanks & Rock", items: ["All-in-One Tanks", "Live Rock", "Aquarium Sand", "Frag Plugs"] },
      ],
      featured: { img: PH + "reef-6.jpg", title: "Reef Lighting", sub: "Top brands in stock" },
    },
  ],

  categories: [
    { key: "corals", label: "Live Corals", count: 318, img: PH + "reef-5.jpg", icon: "flower-2" },
    { key: "fish",   label: "Saltwater Fish", count: 142, img: PH + "reef-2.jpg", icon: "fish" },
    { key: "inverts", label: "Inverts & CUC", count: 64,  img: PH + "reef-7.jpg", icon: "shell" },
    { key: "supplies", label: "Dry Goods", count: 210, img: PH + "reef-6.jpg", icon: "package" },
  ],

  // trust bar
  trust: [
    { icon: "shield-check", title: "Reef-Safe Guarantee", sub: "5-day live arrival promise" },
    { icon: "truck", title: "FedEx Overnight", sub: "Free over $250 livestock" },
    { icon: "award", title: "Reef Rewards", sub: "5% back on every order" },
    { icon: "store", title: "Sandy Showroom", sub: "60+ display tanks in person" },
  ],

  products: [
    { id: 1,  name: "Sunburst Zoanthids",        sci: "Zoanthus sp.",            vendor: "Aquacultured",  type: "coral",  cat: "Coral",  price: 24.99,  compareAt: 79.99, wysiwyg: false, stock: "live", img: PH+"reef-3.jpg", care: "Easy",         reef: "Safe" },
    { id: 2,  name: "Electric Hammer Coral",     sci: "Euphyllia ancora",        vendor: "Aquacultured",  type: "coral",  cat: "Coral",  price: 129.00, compareAt: 179.00,wysiwyg: false, stock: "live", img: PH+"reef-5.jpg", care: "Moderate",     reef: "Safe" },
    { id: 3,  name: "Blue Hippo Tang",           sci: "Paracanthurus hepatus",   vendor: "Tank-Raised",   type: "fish",   cat: "Fish",   price: 189.00, compareAt: null,  wysiwyg: false, stock: "live", img: PH+"reef-2.jpg", care: "Moderate",     reef: "Safe" },
    { id: 4,  name: "Rainbow Acan Lord",         sci: "Acanthastrea lordhowensis",vendor: "Aquacultured", type: "coral",  cat: "Coral",  price: 74.00,  compareAt: 99.00, wysiwyg: false, stock: "sold", img: PH+"reef-4.jpg", care: "Easy",         reef: "Safe" },
    { id: 5,  name: "Skunk Cleaner Shrimp",      sci: "Lysmata amboinensis",     vendor: "Wild-Sourced",  type: "invert", cat: "Invert", price: 28.00,  compareAt: null,  wysiwyg: false, stock: "live", img: PH+"reef-7.jpg", care: "Easy",         reef: "Safe" },
    { id: 6,  name: "Gold Torch Coral",          sci: "Euphyllia glabrescens",   vendor: "Aquacultured",  type: "coral",  cat: "Coral",  price: 95.00,  compareAt: 140.00,wysiwyg: false, stock: "live", img: PH+"reef-6.jpg", care: "Moderate",     reef: "Safe" },
    { id: 7,  name: "Royal Gramma Basslet",      sci: "Gramma loreto",           vendor: "Wild-Sourced",  type: "fish",   cat: "Fish",   price: 41.99,  compareAt: null,  wysiwyg: false, stock: "live", img: PH+"reef-8.jpg", care: "Easy",         reef: "Safe" },
    { id: 8,  name: "Duncan Coral Colony",       sci: "Duncanopsammia axifuga",  vendor: "Aquacultured",  type: "coral",  cat: "Coral",  price: 58.00,  compareAt: 89.00, wysiwyg: false, stock: "live", img: PH+"reef-1.jpg", care: "Easy",         reef: "Safe" },
    { id: 9,  name: "Yellow Watchman Goby",      sci: "Cryptocentrus cinctus",   vendor: "Tank-Raised",   type: "fish",   cat: "Fish",   price: 32.00,  compareAt: null,  wysiwyg: false, stock: "live", img: PH+"reef-5.jpg", care: "Easy",         reef: "Safe" },
    { id: 10, name: "Turbo Snail CUC Pack (x10)",sci: "Turbo fluctuosa",         vendor: "Wild-Sourced",  type: "invert", cat: "Invert", price: 34.99,  compareAt: 49.99, wysiwyg: false, stock: "live", img: PH+"reef-7.jpg", care: "Easy",         reef: "Safe" },
    { id: 11, name: "Rock Flower Anemone",       sci: "Phymanthus crucifer",     vendor: "Maricultured",  type: "invert", cat: "Invert", price: 45.00,  compareAt: null,  wysiwyg: false, stock: "live", img: PH+"reef-4.jpg", care: "Easy",         reef: "Caution" },
    { id: 12, name: "Nebula Tenuis Acropora",    sci: "Acropora tenuis",         vendor: "Aquacultured",  type: "coral",  cat: "Coral",  price: 299.00, compareAt: 329.00,wysiwyg: false, stock: "live", img: PH+"reef-3.jpg", care: "Expert",       reef: "Safe" },
    { id: 13, name: "Ocellaris Clownfish (Pair)",sci: "Amphiprion ocellaris",    vendor: "Tank-Raised",   type: "fish",   cat: "Fish",   price: 79.99,  compareAt: 99.99, wysiwyg: false, stock: "live", img: PH+"reef-2.jpg", care: "Easy",         reef: "Safe" },
    { id: 14, name: "Green Star Polyp Mat",      sci: "Pachyclavularia sp.",     vendor: "Aquacultured",  type: "coral",  cat: "Coral",  price: 19.99,  compareAt: 39.99, wysiwyg: false, stock: "live", img: PH+"reef-8.jpg", care: "Easy",         reef: "Safe" },
    { id: 15, name: "Flame Hawkfish",            sci: "Neocirrhites armatus",    vendor: "Wild-Sourced",  type: "fish",   cat: "Fish",   price: 101.99, compareAt: null,  wysiwyg: false, stock: "sold", img: PH+"reef-4.jpg", care: "Easy",         reef: "Caution" },
    { id: 16, name: "Tubbs Stellata Montipora",  sci: "Montipora stellata",      vendor: "Aquacultured",  type: "coral",  cat: "Coral",  price: 64.00,  compareAt: 84.00, wysiwyg: false, stock: "live", img: PH+"reef-6.jpg", care: "Moderate",     reef: "Safe" },
  ],
};

// Live "open now" label computed from site.hours (mirrors what the site would do server-side).
window.TFT_HOURS = function () {
  const s = window.TFT_DATA.site;
  const now = new Date();
  const today = s.hours[now.getDay()];
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const fmt = (t) => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`; };
  if (today && nowMin >= toMin(today.open) && nowMin < toMin(today.close)) {
    return `Open today · till ${fmt(today.close)}`;
  }
  // find next open day
  for (let i = 1; i <= 7; i++) {
    const d = s.hours[(now.getDay() + i) % 7];
    if (d) return `Closed · opens ${d.day} ${fmt(d.open)}`;
  }
  return `${s.address.city}, ${s.address.region}`;
};
