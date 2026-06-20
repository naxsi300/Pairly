import { COPY } from "../copy";

export type Tab = "home" | "wishlist" | "mood";

interface NavBarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home", label: COPY.nav.home, emoji: "🏠" },
  { id: "wishlist", label: COPY.nav.wishlist, emoji: "🗒" },
  { id: "mood", label: COPY.nav.mood, emoji: "🙂" },
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
