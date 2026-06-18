import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "btn-m3-filled",
  secondary: "btn-m3-outlined",
  ghost: "btn-m3-text",
  danger: "btn-m3-text text-[var(--m3-error)] hover:bg-[color-mix(in_srgb,var(--m3-error)_8%,transparent)]",
  icon: "btn-m3-icon",
};

export function Button({
  variant = "primary",
  full,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${variants[variant]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
