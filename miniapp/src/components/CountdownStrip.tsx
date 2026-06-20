import type { Countdown } from "../types";
import { countdownDays, countdownEmoji } from "../lib/format";

/**
 * Home strip of elapsed-time countdowns — replaces the old "N дней вместе /
 * хотелок / сделано" stat row. Draws up to 3 PAST countdowns (the "together
 * since / how long ago" timeline, e.g. «Знакомство · 112 дней назад»). Cells
 * stretch (flex:1) to fill the row, so 1–3 items always look intentional.
 *
 * Milestone (reference) countdowns sort first and read "дней вместе"; ordinary
 * past ones read "дней назад". Future countdowns are NOT shown here — they live
 * in the "Ближайший повод" card.
 */
export function CountdownStrip({ items }: { items: Countdown[] }) {
  const now = new Date();
  const rows = items
    .map((c) => ({ c, days: countdownDays(c, now) }))
    .filter((r) => r.days <= 0) // elapsed only — the together/ago timeline
    .sort((a, b) => {
      const am = a.c.recurrence === "milestone" ? 0 : 1;
      const bm = b.c.recurrence === "milestone" ? 0 : 1;
      if (am !== bm) return am - bm;
      return Math.abs(a.days) - Math.abs(b.days);
    })
    .slice(0, 3);

  if (rows.length === 0) return null;

  return (
    <div className="stat-row">
      {rows.map(({ c, days }) => {
        const milestone = c.recurrence === "milestone";
        return (
          <div className="stat" key={c.id} style={{ padding: "14px 8px", gap: 0 }}>
            <div style={{ fontSize: 24, lineHeight: 1.1 }}>{countdownEmoji(c)}</div>
            <div className="stat-big" style={{ fontSize: 26 }}>{Math.abs(days)}</div>
            <div className="stat-label">{milestone ? "дней вместе" : "дней назад"}</div>
            <div className="stat-label" style={{ color: "var(--tg-text)", fontWeight: 600, marginTop: 2 }}>
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
