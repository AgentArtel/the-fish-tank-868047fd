export type ContentStatus =
  | "idea" | "needs_media" | "drafting" | "needs_review"
  | "approved" | "scheduled" | "posted" | "archived";

export const STATUS_LABELS: Record<ContentStatus, string> = {
  idea: "Idea", needs_media: "Needs media", drafting: "Drafting",
  needs_review: "Needs review", approved: "Approved",
  scheduled: "Scheduled", posted: "Posted", archived: "Archived",
};

const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  idea: ["needs_media", "drafting", "archived"],
  needs_media: ["drafting", "idea", "archived"],
  drafting: ["needs_review", "needs_media", "archived"],
  needs_review: ["approved", "drafting", "archived"],
  approved: ["scheduled", "drafting", "archived"],
  scheduled: ["posted", "approved", "archived"],
  posted: ["archived"],
  archived: ["idea"],
};

export function allowedNext(s: ContentStatus): ContentStatus[] {
  return TRANSITIONS[s] ?? [];
}

export function isTransitionAllowed(from: ContentStatus, to: ContentStatus) {
  if (to === "archived") return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const PLATFORMS = ["facebook","instagram","tiktok","youtube_shorts","google_business"] as const;
export type Platform = typeof PLATFORMS[number];
export const PLATFORM_LABELS: Record<Platform,string> = {
  facebook:"Facebook", instagram:"Instagram", tiktok:"TikTok",
  youtube_shorts:"YouTube Shorts", google_business:"Google Business",
};

export const PRODUCT_TYPES = ["dry_good","fish","coral","invert","service","brand","general_content_subject"] as const;
export const AVAILABILITY = ["available","sold","ordered","unavailable","unknown"] as const;
export const SOURCE_TYPES = ["phone_upload","camera_upload","vendor_asset","ai_generated","edited_asset"] as const;
export const USAGE_RIGHTS = ["owned","vendor_allowed","needs_permission","unknown"] as const;
export const CONTENT_TYPES = ["photo","video","reel","story","carousel","live","blog","announcement","promo","educational","other"] as const;
