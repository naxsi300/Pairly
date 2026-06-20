import { COPY } from "../copy";

export type Tab = "home" | "wishlist" | "wheel" | "gifts";

interface NavBarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home", label: COPY.nav.home, emoji: "🏠" },
  { id: "wishlist", label: COPY.nav.wishlist, emoji: "🗒" },
  { id: "wheel", label: COPY.nav.wheel, emoji: "🎡" },
  { id: "gifts", label: COPY.nav.gifts, emoji: "🎁" },
];

/** Floating glass-pill bottom nav — 1:1 with the R-warm gallery's nav. */
export function NavBar({ tab, onTabChange }: NavBarProps) {
  return (
    <nav className="nav-rw">
      <div className="nav-inner">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              aria-pressed={active}
              className={`nav-item ${active ? "active" : ""}`}
            >
              <span className="nav-emoji" aria-hidden>
                {t.emoji}
              </span>
              <span className="nav-label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
