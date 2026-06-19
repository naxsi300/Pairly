import { useEffect, useState } from "react";
import { COPY } from "../copy";
import { Card } from "./Card";
import { haptic } from "../sdk/twa";

/** A small weekly ritual checklist, persisted per ISO week in localStorage.
 *
 * No backend yet — this is an ambient nudge to be together. The check state is
 * keyed by year+week so it resets each week. If/when a backend ritual table is
 * added, this component is the UI surface to keep.
 */
function weekKey(d = new Date()): string {
  // ISO week year + week number (stable, resets Mondays).
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

const STORAGE_KEY = "pairly.rituals";

export function Rituals() {
  const week = weekKey();
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}.${week}`);
      setDone(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setDone({});
    }
  }, [week]);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(`${STORAGE_KEY}.${week}`, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      haptic("light");
      return next;
    });
  }

  const count = Object.values(done).filter(Boolean).length;

  return (
    <Card>
      <p className="rw-section-label" style={{ margin: "0 0 4px" }}>
        {COPY.home.cardRitualsTitle}
      </p>
      <p className="rw-sub mb-2">{COPY.home.ritualsSub}</p>
      <ul className="flex flex-col gap-1.5">
        {COPY.home.rituals.map((r) => {
          const checked = !!done[r.id];
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                className="flex w-full items-center gap-3 py-1 text-left"
              >
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs"
                  style={{
                    background: checked ? "var(--warm)" : "var(--m3-surface-container-high)",
                    color: checked ? "#fff" : "var(--m3-on-surface-variant)",
                  }}
                  aria-hidden
                >
                  {checked ? "✓" : ""}
                </span>
                <span className="text-base text-tg-text">
                  <span className="mr-1">{r.emoji}</span>
                  <span className={checked ? "line-through opacity-60" : ""}>{r.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="rw-meta mt-2">{COPY.home.ritualsDone.replace("{n}", String(count))}</p>
    </Card>
  );
}
