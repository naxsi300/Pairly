import { useCallback, useRef, type PointerEvent } from "react";
export type Tab = "home" | "wishlist" | "mood";

import { COPY } from "../copy";

interface NavBarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home", label: COPY.nav.home, emoji: "🏠" },
  { id: "wishlist", label: COPY.nav.wishlist, emoji: "🗒" },
  { id: "mood", label: COPY.nav.mood, emoji: "🙂" },
];

export function NavBar({ tab, onTabChange }: NavBarProps) {
  const barRef = useRef<HTMLUListElement>(null);

  // Ripple on tap
  const onPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }, []);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 navbar-m3"
      style={{
        paddingBottom: "var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom))",
      }}
    >
      <ul ref={barRef} className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <li key={t.id} className="relative">
              <button
                type="button"
                onClick={() => onTabChange(t.id)}
                onPointerDown={onPointerDown}
                aria-pressed={active}
                className="ripple-container flex w-full flex-col items-center gap-0.5 py-3 text-m3-label"
                style={{ color: active ? "var(--m3-primary)" : "var(--m3-on-surface-variant)" }}
              >
                <span
                  className="text-xl transition-transform duration-200 ease-out"
                  style={{ transform: active ? "scale(1.1)" : "scale(1)" }}
                  aria-hidden
                >
                  {t.emoji}
                </span>
                <span className="leading-none">{t.label}</span>
              </button>

              {/* Active pill indicator */}
              {active ? (
                <span
                  className="absolute bottom-1 left-1/2 h-8 rounded-full transition-transform duration-300 ease-out"
                  style={{
                    width: "calc(100% - 16px)",
                    transform: "translateX(-50%)",
                    background: "var(--m3-primary-container)",
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
