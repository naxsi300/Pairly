import { useState } from "react";
import { COPY } from "./copy";
import { IS_MOCK } from "./sdk/api";
import { initTwa } from "./sdk/twa";
import { Wishlist } from "./screens/Wishlist";
import { Bucket } from "./screens/Bucket";
import { Countdowns } from "./screens/Countdowns";
import { Mood } from "./screens/Mood";
import { QuestionOfTheDay } from "./screens/QuestionOfTheDay";
import { Gifts } from "./screens/Gifts";

type Tab = "wishlist" | "bucket" | "countdowns" | "mood" | "qotd" | "gifts";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "wishlist", label: COPY.nav.wishlist, emoji: "🗒" },
  { id: "bucket", label: COPY.nav.bucket, emoji: "🌌" },
  { id: "countdowns", label: COPY.nav.countdowns, emoji: "📅" },
  { id: "mood", label: COPY.nav.mood, emoji: "🙂" },
  { id: "qotd", label: COPY.nav.qotd, emoji: "💭" },
  { id: "gifts", label: COPY.nav.gifts, emoji: "🎁" },
];

// Initialise the Telegram WebApp SDK once (no-op outside Telegram).
initTwa();

export default function App() {
  const [tab, setTab] = useState<Tab>("wishlist");

  return (
    <div className="flex min-h-full flex-col">
      {IS_MOCK ? (
        <div className="bg-amber-500/10 px-4 py-1 text-center text-xs text-amber-600">
          demo-режим: показаны примеры данных
        </div>
      ) : null}

      <main className="flex-1">
        {tab === "wishlist" ? <Wishlist /> : null}
        {tab === "bucket" ? <Bucket /> : null}
        {tab === "countdowns" ? <Countdowns /> : null}
        {tab === "mood" ? <Mood /> : null}
        {tab === "qotd" ? <QuestionOfTheDay /> : null}
        {tab === "gifts" ? <Gifts /> : null}
      </main>

      {/* Bottom tab bar — single-page nav (open-decisions.md #1). */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 top-blur"
        style={{
          paddingBottom: "var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom))",
        }}
      >
        <ul className="mx-auto grid max-w-md grid-cols-6">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={active}
                  className={`flex w-full flex-col items-center gap-0.5 py-2 text-[11px] transition ${
                    active ? "text-tg-link" : "text-tg-hint"
                  }`}
                >
                  <span className="text-lg" aria-hidden>
                    {t.emoji}
                  </span>
                  <span className="leading-none">{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
