import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** A rounded surface themed via Telegram's secondary-bg variable. */
export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl2 bg-tg-secondary p-4 shadow-soft card-soft ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
