import * as React from "react";

/**
 * Container surface — warm white panel or dark ocean tone.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default "light" */
  tone?: "light" | "ocean";
  /** Resting elevation (ignored for ocean tone). @default "sm" */
  elevation?: "none" | "sm" | "md" | "lg";
  /** Lift + deepen shadow on hover. @default false */
  hoverable?: boolean;
  /** Inner padding (any CSS length). @default "var(--space-6)" */
  padding?: string;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned action slot. */
  action?: React.ReactNode;
}
export declare function CardHeader(props: CardHeaderProps): JSX.Element;
