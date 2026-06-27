import * as React from "react";

/**
 * Compact label for categories, status and live-stock state.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone. @default "neutral" */
  tone?: "blue" | "cyan" | "gold" | "ocean" | "neutral" | "success" | "warning" | "danger";
  /** Fill style. @default "soft" */
  variant?: "solid" | "soft" | "outline";
  /** @default "md" */
  size?: "sm" | "md";
  /** Show a leading status dot. @default false */
  dot?: boolean;
  children?: React.ReactNode;
}

export declare function Badge(props: BadgeProps): JSX.Element;
