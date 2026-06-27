import * as React from "react";

/**
 * Styled native dropdown with label, hint/error and a custom chevron.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerStyle?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Select(props: SelectProps): JSX.Element;
