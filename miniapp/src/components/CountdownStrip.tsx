import type { Countdown } from "../types";
import { countdownDays, countdownEmoji } from "../lib/format";

/**
 * Home strip of elapsed-time countdowns — the "how long ago" timeline
 * (e.g. «Знакомство · 112 дней назад»). Draws up to 3 PAST countdowns. Cells
 * stretch (flex:1) to fill the row, so 1–3 items always look intentional.
 *
 * Milestone (reference-date) countdowns still count days since the date and
 * read "дней назад" — neutral, no relationship bias (the date can be any
 * reference event). Future countdowns are NOT shown here — they live in the
 * "Ближайший повод" card.
 */
export function CountdownStrip({ items }: { items: Countdown[] }) {
  const now = new Date();
  const rows = items
    .map((c) => ({ c, days: countdownDays(c, now) }))
    // Drop countdowns whose targetDate is unparseable — they would render
    // as "0 дней назад" (countdownDays falls back to 0 on NaN targets),
    // which is both wrong and confusing on the home strip.
    .filter((r) => Number.isFinite(r.days))
    // Elapsed only — the together/ago timeline. Recurring (annual/monthly)
    // countdowns are excluded: they roll forward to "Ближайщий повод" instead
    // of freezing as "N дней назад".
    .filter((r) => r.days <= 0 && r.c.recurrence !== "annual" && r.c.recurrence !== "monthly")
    .sort((a, b) => {
      const am = a.c.recurrence === "milestone" ? 0 : 1;
      const bm = b.c.recurrence === "milestone" ? 0 : 1;
      if (am !== bm) return am - bm;
      // Within a group, longest-ago first so the row anchors on the
      // biggest, most emotionally-weighted interval.
      return Math.abs(b.days) - Math.abs(a.days);
    })
    .slice(0, 3);

  if (rows.length === 0) return null;

  return (
    <div className="stat-row">
      {rows.map(({ c, days }) => {
        return (
          <div className="stat" key={c.id} style={{ padding: "14px 8px", gap: 0 }}>
            <div style={{ fontSize: 24, lineHeight: 1.1 }}>{countdownEmoji(c)}</div>
            <div className="stat-big">{Math.abs(days)}</div>
            <div className="stat-label">дней назад</div>
            <div className="stat-label" style={{ color: "var(--tg-text)", fontWeight: 600, marginTop: 2 }}>
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
