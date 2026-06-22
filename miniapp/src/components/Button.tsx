import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "warm" | "secondary" | "ghost" | "danger" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  children: ReactNode;
}

/** Map variants onto the canonical R-warm button classes (gallery's .btn family). */
const variants: Record<Variant, string> = {
  primary: "btn",
  warm: "btn-warm",
  secondary: "btn-ghost",
  ghost: "btn-ghost",
  danger: "btn-ghost",
  icon: "btn-ghost",
};

export function Button({
  variant = "primary",
  full,
  className = "",
  children,
  style,
  ...rest
}: ButtonProps) {
  void full; // gallery .btn* are full-width by default
  // `.btn*` are full-width by default in the gallery. `danger` tints ghost red.
  const dangerStyle =
    variant === "danger"
      ? {
          color: "var(--tg-danger)",
          borderColor: "color-mix(in srgb, var(--tg-danger) 30%, transparent)",
          ...style,
        }
      : style;
  return (
    <button className={`${variants[variant]} ${className}`} style={dangerStyle} {...rest}>
      {children}
    </button>
  );
}
