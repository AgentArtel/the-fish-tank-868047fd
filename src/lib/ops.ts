// Shared types + label maps for the Operations / Inventory Intake module.

export const VENDOR_BATCH_SOURCE_TYPES = ["invoice","order_sheet","packing_list","manual_entry","other"] as const;
export type VendorBatchSourceType = typeof VENDOR_BATCH_SOURCE_TYPES[number];
export const VENDOR_BATCH_SOURCE_LABELS: Record<VendorBatchSourceType,string> = {
  invoice: "Invoice", order_sheet: "Order sheet", packing_list: "Packing list",
  manual_entry: "Manual entry", other: "Other",
};

export const VENDOR_BATCH_INTAKE_STATUSES = ["draft","uploaded","parsing","review","approved","converted","archived"] as const;
export type VendorBatchIntakeStatus = typeof VENDOR_BATCH_INTAKE_STATUSES[number];
export const VENDOR_BATCH_INTAKE_LABELS: Record<VendorBatchIntakeStatus,string> = {
  draft:"Draft", uploaded:"Uploaded", parsing:"Parsing", review:"In review",
  approved:"Approved", converted:"Converted", archived:"Archived",
};

export const VENDOR_BATCH_EXTRACTION_STATUSES = ["not_started","manual","ai_pending","ai_done","failed"] as const;
export type VendorBatchExtractionStatus = typeof VENDOR_BATCH_EXTRACTION_STATUSES[number];
export const VENDOR_BATCH_EXTRACTION_LABELS: Record<VendorBatchExtractionStatus,string> = {
  not_started:"Not started", manual:"Manual entry", ai_pending:"AI pending",
  ai_done:"AI complete", failed:"Failed",
};

export const VENDOR_LINE_REVIEW = ["pending","approved","rejected","needs_info"] as const;
export type VendorLineReview = typeof VENDOR_LINE_REVIEW[number];
export const VENDOR_LINE_REVIEW_LABELS: Record<VendorLineReview,string> = {
  pending:"Pending", approved:"Approved", rejected:"Rejected", needs_info:"Needs info",
};

export const VENDOR_LINE_PRICING = ["not_priced","suggested","approved"] as const;
export type VendorLinePricing = typeof VENDOR_LINE_PRICING[number];
export const VENDOR_LINE_PRICING_LABELS: Record<VendorLinePricing,string> = {
  not_priced:"Not priced", suggested:"Suggested", approved:"Approved",
};

export const VENDOR_LINE_KINDS = ["sellable","charge"] as const;
export type VendorLineKind = typeof VENDOR_LINE_KINDS[number];

export const VENDOR_CHARGE_TYPES = ["freight","packaging","heat_pack","box","fuel_surcharge","discount","credit","tax","other"] as const;
export type VendorChargeType = typeof VENDOR_CHARGE_TYPES[number];
export const VENDOR_CHARGE_LABELS: Record<VendorChargeType,string> = {
  freight:"Freight", packaging:"Packaging", heat_pack:"Heat pack", box:"Box",
  fuel_surcharge:"Fuel surcharge", discount:"Discount", credit:"Credit",
  tax:"Tax", other:"Other",
};

export const INVENTORY_AVAILABILITY = ["incoming","quarantine","needs_id","available","on_hold","sold_out","not_for_sale","dead_lost"] as const;
export type InventoryAvailability = typeof INVENTORY_AVAILABILITY[number];
export const INVENTORY_AVAILABILITY_LABELS: Record<InventoryAvailability,string> = {
  incoming:"Incoming", quarantine:"Quarantine", needs_id:"Needs ID",
  available:"Available", on_hold:"On hold", sold_out:"Sold out",
  not_for_sale:"Not for sale", dead_lost:"Dead / Lost",
};

export const INVENTORY_PRICING = ["not_priced","approved"] as const;
export type InventoryPricing = typeof INVENTORY_PRICING[number];
export const INVENTORY_PRICING_LABELS: Record<InventoryPricing,string> = {
  not_priced:"Not priced", approved:"Approved",
};

export const INVENTORY_LIVE_SALE = ["not_eligible","eligible","staged","live","ended"] as const;
export type InventoryLiveSale = typeof INVENTORY_LIVE_SALE[number];
export const INVENTORY_LIVE_SALE_LABELS: Record<InventoryLiveSale,string> = {
  not_eligible:"Not eligible", eligible:"Eligible", staged:"Staged",
  live:"Live", ended:"Ended",
};

export const STORE_LOCATION_KINDS = ["zone","display_tank","coral_flat","live_sale_tank","quarantine","holding","dry_goods","back_of_house","other"] as const;
export type StoreLocationKind = typeof STORE_LOCATION_KINDS[number];
export const STORE_LOCATION_KIND_LABELS: Record<StoreLocationKind,string> = {
  zone:"Zone (group)", display_tank:"Display tank", coral_flat:"Coral flat", live_sale_tank:"Live-sale tank",
  quarantine:"Quarantine", holding:"Holding", dry_goods:"Dry goods",
  back_of_house:"Back of house", other:"Other",
};

export const ITEM_TYPES = ["fish","coral","invert","dry_good","live_rock","equipment","other"] as const;
export type ItemType = typeof ITEM_TYPES[number];
export const ITEM_TYPE_LABELS: Record<ItemType,string> = {
  fish:"Fish", coral:"Coral", invert:"Invertebrate", dry_good:"Dry good",
  live_rock:"Live rock", equipment:"Equipment", other:"Other",
};

export const LOSS_REASONS = ["dead_on_arrival","escaped","damaged","missing","substituted","other"] as const;
export type LossReason = typeof LOSS_REASONS[number];
export const LOSS_REASON_LABELS: Record<LossReason,string> = {
  dead_on_arrival:"DOA", escaped:"Escaped", damaged:"Damaged",
  missing:"Missing", substituted:"Substituted", other:"Other",
};

export const INVENTORY_MEDIA_TAGS = ["internal","social","website","live_sale"] as const;
export type InventoryMediaTag = typeof INVENTORY_MEDIA_TAGS[number];

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US",{ style:"currency", currency:"USD" }).format(Number(n));
}

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || `id-${Date.now()}`;
}
