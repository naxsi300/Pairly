import type { ReactNode } from "react";

/** Shared warm screen header for the destination screens — a warm emoji tile +
 *  title + optional action (e.g. an add button). Matches the home-cards system
 *  (warm-wash tile, --tg-* tokens) so every screen reads as one design language. */
export function ScreenHeader({
  emoji,
  title,
  action,
}: {
  emoji: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 12, margin: "2px 2px 14px" }}>
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
          flexShrink: 0,
        }}
      >
        {emoji}
      </span>
      <h1
        style={{
          flex: 1,
          minWidth: 0,
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.3px",
          color: "var(--tg-text)",
        }}
      >
        {title}
      </h1>
      {action}
    </header>
  );
}
