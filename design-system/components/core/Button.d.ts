import * as React from "react";

/**
 * Primary call-to-action button for The Fish Tank.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: "primary" | "gold" | "ocean" | "secondary" | "outline" | "ghost" | "link";
  /** Control size. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Icon element rendered before the label. */
  leftIcon?: React.ReactNode;
  /** Icon element rendered after the label. */
  rightIcon?: React.ReactNode;
  /** Stretch to fill the container width. @default false */
  fullWidth?: boolean;
  /** Render as a different element (e.g. "a"). @default "button" */
  as?: keyof JSX.IntrinsicElements;
  children?: React.ReactNode;
}

export declare function Button(props: ButtonProps): JSX.Element;
