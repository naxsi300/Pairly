import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Use lower-elevation surface (for input areas). Default: false. */
  low?: boolean;
}

/** M3 card — opaque surface with tonal elevation, replaces .card-glass. */
export function Card({ children, low, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`${low ? "card-m3-low" : "card-m3"} p-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
