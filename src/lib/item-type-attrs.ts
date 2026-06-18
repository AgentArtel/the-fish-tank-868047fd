// Per-item-type structured attributes schema.
// Stored as JSONB `attrs` on inventory_items and vendor_line_items.
// Add new fields here — no migration needed.

export type ItemType =
  | "fish"
  | "coral"
  | "invert"
  | "dry_good"
  | "live_rock"
  | "equipment"
  | "other";

export type AttrFieldType = "text" | "number" | "select" | "boolean";

export interface AttrField {
  key: string;
  label: string;
  type: AttrFieldType;
  options?: string[]; // for select
  help?: string;
  placeholder?: string;
}

export interface AttrGroup {
  label: string;
  fields: AttrField[];
}

const SHARED_LIVESTOCK: AttrGroup = {
  label: "Care",
  fields: [
    {
      key: "care_level",
      label: "Care level",
      type: "select",
      options: ["beginner", "intermediate", "expert"],
    },
    {
      key: "temperament",
      label: "Temperament",
      type: "select",
      options: ["peaceful", "semi-aggressive", "aggressive", "reef-safe", "not reef-safe"],
    },
    { key: "diet", label: "Diet", type: "text", placeholder: "e.g. frozen mysis, pellets, algae" },
    { key: "min_tank_size_gal", label: "Min tank size (gal)", type: "number" },
    { key: "captive_bred", label: "Captive bred", type: "boolean" },
  ],
};

export const ITEM_TYPE_SCHEMA: Record<ItemType, AttrGroup[]> = {
  fish: [
    SHARED_LIVESTOCK,
    {
      label: "Fish-specific",
      fields: [
        { key: "max_size_in", label: "Adult size (in)", type: "number" },
        {
          key: "swim_zone",
          label: "Swim zone",
          type: "select",
          options: ["top", "mid", "bottom", "all"],
        },
        {
          key: "reef_safe",
          label: "Reef safe",
          type: "select",
          options: ["yes", "with caution", "no"],
        },
      ],
    },
  ],
  coral: [
    {
      label: "Coral details",
      fields: [
        {
          key: "inventory_role",
          label: "Inventory role",
          type: "select",
          options: ["for_sale", "growout", "mother_colony", "frag_source", "hold"],
          help: "Operational role of this coral. Availability to customers is controlled by Availability status.",
        },
        {
          key: "coral_type",
          label: "Type",
          type: "select",
          options: ["SPS", "LPS", "soft", "zoanthid", "mushroom", "anemone"],
        },
        { key: "lighting", label: "Lighting", type: "select", options: ["low", "medium", "high"] },
        { key: "flow", label: "Flow", type: "select", options: ["low", "medium", "high"] },
        {
          key: "placement",
          label: "Placement",
          type: "select",
          options: ["bottom", "mid", "top", "any"],
        },
        {
          key: "aggression",
          label: "Aggression",
          type: "select",
          options: ["low", "medium", "high"],
        },
        {
          key: "frag_size",
          label: "Frag / colony size",
          type: "text",
          placeholder: "e.g. 1in frag, mini-colony",
        },
        { key: "aquacultured", label: "Aquacultured", type: "boolean" },
      ],
    },
  ],
  invert: [
    SHARED_LIVESTOCK,
    {
      label: "Invert-specific",
      fields: [
        {
          key: "invert_kind",
          label: "Kind",
          type: "select",
          options: ["shrimp", "snail", "crab", "starfish", "urchin", "clam", "other"],
        },
        {
          key: "reef_safe",
          label: "Reef safe",
          type: "select",
          options: ["yes", "with caution", "no"],
        },
      ],
    },
  ],
  live_rock: [
    {
      label: "Live rock",
      fields: [
        {
          key: "rock_type",
          label: "Type",
          type: "select",
          options: ["base", "shelf", "branch", "dry", "cured live"],
        },
        { key: "weight_lb", label: "Weight (lb)", type: "number" },
        { key: "cured", label: "Cured", type: "boolean" },
      ],
    },
  ],
  dry_good: [
    {
      label: "Product",
      fields: [
        { key: "brand", label: "Brand", type: "text" },
        { key: "model", label: "Model / SKU", type: "text" },
        { key: "upc", label: "UPC / barcode", type: "text" },
        { key: "weight_oz", label: "Weight (oz)", type: "number" },
        { key: "expiry_date", label: "Expiry date", type: "text", placeholder: "YYYY-MM-DD" },
      ],
    },
  ],
  equipment: [
    {
      label: "Equipment",
      fields: [
        { key: "brand", label: "Brand", type: "text" },
        { key: "model", label: "Model", type: "text" },
        { key: "serial", label: "Serial", type: "text" },
        { key: "wattage", label: "Wattage", type: "number" },
        { key: "voltage", label: "Voltage", type: "number" },
        { key: "warranty_months", label: "Warranty (months)", type: "number" },
        {
          key: "condition",
          label: "Condition",
          type: "select",
          options: ["new", "open box", "used", "refurbished"],
        },
      ],
    },
  ],
  other: [
    {
      label: "Notes",
      fields: [{ key: "notes", label: "Free-form notes", type: "text" }],
    },
  ],
};

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  fish: "Fish",
  coral: "Coral",
  invert: "Invertebrate",
  dry_good: "Dry good",
  live_rock: "Live rock",
  equipment: "Equipment",
  other: "Other",
};

export function schemaFor(itemType?: string | null): AttrGroup[] {
  if (!itemType) return [];
  return ITEM_TYPE_SCHEMA[itemType as ItemType] ?? ITEM_TYPE_SCHEMA.other;
}
