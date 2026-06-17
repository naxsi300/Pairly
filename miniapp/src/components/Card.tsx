import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** A glass card — semi-transparent surface with backdrop-blur, themed via Telegram vars. */
export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`card-glass p-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
