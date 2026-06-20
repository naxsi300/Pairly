import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Accepted for API compat; the gallery has a single card surface. */
  low?: boolean;
}

/** R-warm card — the gallery's `.card` (rounded 20, soft shadow, column flex). */
export function Card({ children, low, className = "", ...rest }: CardProps) {
  void low; // gallery has one card style
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}
