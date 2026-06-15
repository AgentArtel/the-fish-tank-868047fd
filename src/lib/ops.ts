// Shared types + label maps for the Operations / Inventory Intake module.

export const VENDOR_BATCH_SOURCE_TYPES = [
  "invoice",
  "order_sheet",
  "packing_list",
  "manual_entry",
  "other",
] as const;
export type VendorBatchSourceType = (typeof VENDOR_BATCH_SOURCE_TYPES)[number];
export const VENDOR_BATCH_SOURCE_LABELS: Record<VendorBatchSourceType, string> = {
  invoice: "Invoice",
  order_sheet: "Order sheet",
  packing_list: "Packing list",
  manual_entry: "Manual entry",
  other: "Other",
};

export const VENDOR_BATCH_INTAKE_STATUSES = [
  "draft",
  "uploaded",
  "parsing",
  "review",
  "approved",
  "converted",
  "archived",
] as const;
export type VendorBatchIntakeStatus = (typeof VENDOR_BATCH_INTAKE_STATUSES)[number];
export const VENDOR_BATCH_INTAKE_LABELS: Record<VendorBatchIntakeStatus, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  parsing: "Parsing",
  review: "In review",
  approved: "Approved",
  converted: "Converted",
  archived: "Archived",
};

export const VENDOR_BATCH_EXTRACTION_STATUSES = [
  "not_started",
  "manual",
  "ai_pending",
  "ai_done",
  "failed",
] as const;
export type VendorBatchExtractionStatus = (typeof VENDOR_BATCH_EXTRACTION_STATUSES)[number];
export const VENDOR_BATCH_EXTRACTION_LABELS: Record<VendorBatchExtractionStatus, string> = {
  not_started: "Not started",
  manual: "Manual entry",
  ai_pending: "AI pending",
  ai_done: "AI complete",
  failed: "Failed",
};

export const VENDOR_LINE_REVIEW = ["pending", "approved", "rejected", "needs_info"] as const;
export type VendorLineReview = (typeof VENDOR_LINE_REVIEW)[number];
export const VENDOR_LINE_REVIEW_LABELS: Record<VendorLineReview, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  needs_info: "Needs info",
};

export const VENDOR_LINE_PRICING = ["not_priced", "suggested", "approved"] as const;
export type VendorLinePricing = (typeof VENDOR_LINE_PRICING)[number];
export const VENDOR_LINE_PRICING_LABELS: Record<VendorLinePricing, string> = {
  not_priced: "Not priced",
  suggested: "Suggested",
  approved: "Approved",
};

export const VENDOR_LINE_KINDS = ["sellable", "charge"] as const;
export type VendorLineKind = (typeof VENDOR_LINE_KINDS)[number];

export const VENDOR_CHARGE_TYPES = [
  "freight",
  "packaging",
  "heat_pack",
  "box",
  "fuel_surcharge",
  "discount",
  "credit",
  "tax",
  "other",
] as const;
export type VendorChargeType = (typeof VENDOR_CHARGE_TYPES)[number];
export const VENDOR_CHARGE_LABELS: Record<VendorChargeType, string> = {
  freight: "Freight",
  packaging: "Packaging",
  heat_pack: "Heat pack",
  box: "Box",
  fuel_surcharge: "Fuel surcharge",
  discount: "Discount",
  credit: "Credit",
  tax: "Tax",
  other: "Other",
};

export const INVENTORY_AVAILABILITY = [
  "incoming",
  "quarantine",
  "needs_id",
  "available",
  "on_hold",
  "sold_out",
  "not_for_sale",
  "dead_lost",
] as const;
export type InventoryAvailability = (typeof INVENTORY_AVAILABILITY)[number];
export const INVENTORY_AVAILABILITY_LABELS: Record<InventoryAvailability, string> = {
  incoming: "Incoming",
  quarantine: "Quarantine",
  needs_id: "Needs ID",
  available: "Available",
  on_hold: "On hold",
  sold_out: "Sold out",
  not_for_sale: "Not for sale",
  dead_lost: "Dead / Lost",
};

// Items still needing review: not yet sellable, not terminal (sold_out/dead_lost)
// and not already live (available). Clover imports land here as `not_for_sale`.
export const INVENTORY_REVIEW_STATUSES: InventoryAvailability[] = [
  "not_for_sale",
  "incoming",
  "needs_id",
  "quarantine",
  "on_hold",
];

export const INVENTORY_PRICING = ["not_priced", "approved"] as const;
export type InventoryPricing = (typeof INVENTORY_PRICING)[number];
export const INVENTORY_PRICING_LABELS: Record<InventoryPricing, string> = {
  not_priced: "Not priced",
  approved: "Approved",
};

export const INVENTORY_LIVE_SALE = ["not_eligible", "eligible", "staged", "live", "ended"] as const;
export type InventoryLiveSale = (typeof INVENTORY_LIVE_SALE)[number];
export const INVENTORY_LIVE_SALE_LABELS: Record<InventoryLiveSale, string> = {
  not_eligible: "Not eligible",
  eligible: "Eligible",
  staged: "Staged",
  live: "Live",
  ended: "Ended",
};

export const STORE_LOCATION_KINDS = [
  "zone",
  "room",
  "rack",
  "shelf",
  "bin",
  "freezer",
  "cooler",
  "display_tank",
  "coral_flat",
  "live_sale_tank",
  "quarantine",
  "holding",
  "dry_goods",
  "back_of_house",
  "fish_system",
  "coral_system",
  "frag_tank",
  "growout_tank",
  "offsite_storage",
  "support_station",
  "bulk_storage",
  "other",
] as const;
export type StoreLocationKind = (typeof STORE_LOCATION_KINDS)[number];
export const STORE_LOCATION_KIND_LABELS: Record<StoreLocationKind, string> = {
  zone: "Zone (group)",
  room: "Room",
  rack: "Rack",
  shelf: "Shelf",
  bin: "Bin",
  freezer: "Freezer",
  cooler: "Cooler",
  display_tank: "Display tank",
  coral_flat: "Coral flat",
  live_sale_tank: "Live-sale tank",
  quarantine: "Quarantine",
  holding: "Holding",
  dry_goods: "Dry goods",
  back_of_house: "Back of house",
  fish_system: "Fish system",
  coral_system: "Coral system",
  frag_tank: "Frag tank",
  growout_tank: "Growout tank",
  offsite_storage: "Off-site storage",
  support_station: "Support station",
  bulk_storage: "Bulk storage",
  other: "Other",
};
// Kinds that can contain other locations (used as parent options in the picker).
export const STORE_LOCATION_CONTAINER_KINDS: StoreLocationKind[] = [
  "zone",
  "room",
  "rack",
  "shelf",
  "freezer",
  "cooler",
  "fish_system",
  "coral_system",
];

export const APP_ROLES = ["admin", "manager", "creator", "reviewer", "staff", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];
export const APP_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  creator: "Creator",
  reviewer: "Reviewer",
  staff: "Staff",
  viewer: "Viewer",
};
export const APP_ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Full access. Approves pricing, manages users, deletes anything.",
  manager: "Edit everything except pricing approval and user management.",
  creator: "Create and edit drafts (intake, content, inventory).",
  reviewer: "Edit and review intake, content, and inventory.",
  staff: "Read-only floor access. Can browse inventory and locations.",
  viewer: "Read-only. No editing anywhere.",
};

export const ITEM_TYPES = [
  "fish",
  "coral",
  "invert",
  "dry_good",
  "live_rock",
  "equipment",
  "other",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  fish: "Fish",
  coral: "Coral",
  invert: "Invertebrate",
  dry_good: "Dry good",
  live_rock: "Live rock",
  equipment: "Equipment",
  other: "Other",
};

export const LOSS_REASONS = [
  "dead_on_arrival",
  "escaped",
  "damaged",
  "missing",
  "substituted",
  "other",
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];
export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  dead_on_arrival: "DOA",
  escaped: "Escaped",
  damaged: "Damaged",
  missing: "Missing",
  substituted: "Substituted",
  other: "Other",
};

export const INVENTORY_MEDIA_TAGS = ["internal", "social", "website", "live_sale"] as const;
export type InventoryMediaTag = (typeof INVENTORY_MEDIA_TAGS)[number];

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

// Store pricing rule: retail = wholesale cost × 3, rounded UP to the next X.99.
// e.g. 6.99 → 20.97 → 20.99 · 7.00 → 21.00 → 21.99 · 0.54 → 1.62 → 1.99
// Integer-cent math so float drift can't round a price the wrong way.
export function suggestRetail(cost: number | null | undefined): number | null {
  const c = Number(cost);
  if (cost === null || cost === undefined || !Number.isFinite(c) || c <= 0) return null;
  const tripleCents = Math.round(c * 300);
  return Math.ceil((tripleCents + 1) / 100) - 0.01;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `id-${Date.now()}`
  );
}
