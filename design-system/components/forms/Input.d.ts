import * as React from "react";

/**
 * Single-line text field with label, hint/error and optional leading icon.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  /** Error message — overrides hint and turns the field red. */
  error?: string;
  leftIcon?: React.ReactNode;
  containerStyle?: React.CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;
