import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 select-none";

const variants: Record<Variant, string> = {
  primary: "glass-button text-tg-buttonText shadow-glass-sm",
  secondary: "bg-tg-secondary/70 text-tg-text backdrop-blur-glass-sm",
  ghost: "bg-transparent text-tg-link",
  danger: "bg-transparent text-red-500",
};

export function Button({
  variant = "primary",
  full,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}
