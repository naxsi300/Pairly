import { useCallback, type PointerEvent, type ReactNode } from "react";

interface RippleProps {
  children: ReactNode;
  className?: string;
  /** Ripple color override. Default: var(--tg-text). */
  color?: string;
}

/** Wraps children in a ripple container. On pointerdown, creates an expanding
 *  circle that fades out. Used by buttons, nav tabs, interactive cards. */
export function Ripple({ children, className = "", color }: RippleProps) {
  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      const ripple = document.createElement("span");
      ripple.className = "ripple-effect";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      if (color) ripple.style.background = color;

      el.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    },
    [color],
  );

  return (
    <div
      className={`ripple-container ${className}`}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}
