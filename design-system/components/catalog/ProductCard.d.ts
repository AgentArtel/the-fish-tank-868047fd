import * as React from "react";

/**
 * Production-style reef e-commerce livestock tile — the signature product card.
 */
export interface ProductCardProps {
  /** Square product photo. Per brand rule, no item is shown without a real photo. */
  image: string;
  /** Product name, e.g. "Gold Torch Coral". */
  name: string;
  /** Vendor / line label shown in uppercase, e.g. "TFT Signature". */
  vendor?: string;
  /** Scientific name, rendered italic. */
  scientificName?: string;
  /** Current price (number). Rendered as USD. */
  price: number;
  /** Optional compare-at / regular price; if higher than `price`, a % OFF badge + struck price show. */
  compareAt?: number | null;
  /** Show the WYSIWYG ("what you see is what you get") badge. @default false */
  wysiwyg?: boolean;
  /** Stock state. "sold" greys the photo and shows a Sold Out overlay. @default "live" */
  stock?: "live" | "sold";
  /** Optional extra corner ribbon, e.g. "New". */
  badge?: string;
  /** Add-to-cart handler (shown on hover). */
  onAddToCart?: () => void;
  onClick?: () => void;
}
export declare function ProductCard(props: ProductCardProps): JSX.Element;
