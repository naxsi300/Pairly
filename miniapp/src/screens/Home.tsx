import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import type { MoodResponse, QOTDResponse } from "../sdk/api";
import type { Countdown } from "../types";
import { countdownDisplay, countdownEmoji, nextMilestone, nextOccurrence } from "../lib/format";
import type { Destination } from "../components/MoreSheet";
import { Rituals } from "../components/Rituals";
import { CountdownStrip } from "../components/CountdownStrip";
import { CoupleChallenge, Gratitude } from "../components/Ambient";

/** Home — R-warm dashboard: dynamic countdown strip (the pair's "together since"
 * timeline) + ambient cards (mood, next occasion, QOTD, rituals) + section entries.
 * The wheel lives in its own nav tab; admin entry is on the wheel screen + #admin. */
export function Home({ onOpen }: { onOpen: (d: Destination) => void }) {
  const mood = useApi<MoodResponse>(endpoints.getMood);
  const qotd = useApi<QOTDResponse>(endpoints.getQotd);
  const cds = useApi<Countdown[]>(endpoints.listCountdowns);

  const occasion = nearestOccasion(cds.data);
  const daysToOccasion = occasion
    ? Math.round((occasion.at - Date.now()) / 86_400_000)
    : null;
  const occasionSoon = daysToOccasion !== null && daysToOccasion <= 3;

  return (
    <div className="app-scroll mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
      {/* Dynamic countdown strip — the pair's elapsed-time timeline */}
      <CountdownStrip items={cds.data ?? []} />

      {/* Mood ambient */}
      <button type="button" onClick={() => onOpen("mood")} className="card" style={{ border: "none", cursor: "pointer", textAlign: "left" }}>
        <div className="section-label" style={{ margin: "0 0 4px" }}>{COPY.home.cardMoodTitle}</div>
        <MoodSummary mood={mood.data} />
      </button>

      {/* Next occasion — warm hero when soon */}
      <button type="button" onClick={() => onOpen("countdowns")} className={occasionSoon ? "hero-warm" : "card"} style={{ border: "none", cursor: "pointer", textAlign: "left" }}>
        <div className="section-label" style={{ margin: "0 0 4px" }}>{COPY.home.cardNextOccasionTitle}</div>
        <div className="card-title">
          {occasion ? `${occasion.emoji} ${occasion.label} · ${occasion.sub}` : COPY.home.noOccasion}
        </div>
      </button>

      {/* QOTD */}
      <button type="button" onClick={() => onOpen("qotd")} className="card" style={{ border: "none", cursor: "pointer", textAlign: "left" }}>
        <div className="section-label" style={{ margin: "0 0 4px" }}>{COPY.home.cardQotdTitle}</div>
        <div className="card-title">{qotd.data?.question?.text ?? "…"}</div>
        <div style={{ fontSize: 12, color: "var(--tg-button)", fontWeight: 600, marginTop: 4 }}>{qotdStatus(qotd.data)}</div>
      </button>

      {/* Rituals */}
      <Rituals />

      {/* Weekly couple-challenge */}
      <CoupleChallenge />

      {/* Daily gratitude */}
      <Gratitude />

      {/* Section entries — everything that used to live behind "Ещё", now in the feed */}
      <EntryCard emoji="🌌" title="Мечты" sub="что хотите пережить вместе" onClick={() => onOpen("bucket")} />
      <EntryCard emoji="🎁" title="Подарки" sub="добрые дела и сюрпризы" onClick={() => onOpen("gifts")} />
      <EntryCard emoji="💌" title="Записки" sub="тёплые слова для партнёра" onClick={() => onOpen("notes")} />
    </div>
  );
}

/** The single nearest upcoming occasion across ordinary countdowns AND milestone
 * (reference-date) countdowns — whose next round date is synthesized. */
function nearestOccasion(
  items: Countdown[] | null | undefined,
): { at: number; emoji: string; label: string; sub: string } | null {
  if (!items || items.length === 0) return null;
  const now = Date.now();
  const cands: { at: number; emoji: string; label: string; sub: string }[] = [];
  for (const c of items) {
    if (c.recurrence === "milestone") {
      const m = nextMilestone(c);
      if (m) cands.push({ at: m.date.getTime(), emoji: countdownEmoji(c), label: m.label, sub: occasionSub(m.daysUntil) });
    } else {
      // Recurring (annual/monthly) countdowns roll forward to their next
      // occurrence — include those even when the stored date has passed.
      const occ = nextOccurrence(c);
      const at = (occ ?? new Date(c.targetDate)).getTime();
      if (at > now) cands.push({ at, emoji: countdownEmoji(c), label: c.label, sub: countdownDisplay(c) });
    }
  }
  cands.sort((a, b) => a.at - b.at);
  return cands[0] ?? null;
}

function occasionSub(daysUntil: number): string {
  if (daysUntil <= 0) return "сегодня!";
  return `через ${daysUntil} дн.`;
}

function MoodSummary({ mood }: { mood: MoodResponse | null | undefined }) {
  if (!mood) return <div className="card-sub">…</div>;
  const mine = mood.self?.mood ?? COPY.mood.notSet;
  const theirs = mood.partner?.mood ?? COPY.mood.notSet;
  return (
    <div className="card-title">
      {COPY.mood.youLabel}: {mine} · {mood.partnerName || COPY.mood.partnerLabel}: {theirs}
    </div>
  );
}

function qotdStatus(q: QOTDResponse | null | undefined): string {
  if (!q || !q.question) return COPY.home.qotdHint;
  if (q.myAnswer && q.partnerAnswered) return COPY.home.qotdBothAnswered;
  if (q.myAnswer && !q.partnerAnswered) return COPY.home.qotdWaitingPartner;
  return COPY.home.qotdYouWaiting;
}

/** A "tap to open" section entry — same .card surface as the ambient cards so it
 *  reads as part of the feed; the warm chevron is the only accent. */
function EntryCard({
  emoji,
  title,
  sub,
  onClick,
}: {
  emoji: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card card-row"
      style={{ border: "none", cursor: "pointer", textAlign: "left", alignItems: "center" }}
    >
      <span className="emoji" style={{ fontSize: 24 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card-title">{title}</div>
        <div className="card-sub">{sub}</div>
      </div>
      <span style={{ color: "var(--tg-hint)", fontWeight: 700, fontSize: 18 }}>›</span>
    </button>
  );
}
