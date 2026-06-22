import { useMemo } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import type { GiftsResponse, LoveNoteItem, MoodResponse, QOTDResponse } from "../sdk/api";
import type { BucketItem, Countdown } from "../types";
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
  const bucket = useApi<BucketItem[]>(endpoints.listBucket);
  const gifts = useApi<GiftsResponse>(endpoints.listGifts);
  const notes = useApi<LoveNoteItem[]>(endpoints.listLoveNotes);

  const occasion = nearestOccasion(cds.data);
  const daysToOccasion = occasion
    ? Math.round((occasion.at - Date.now()) / 86_400_000)
    : null;
  const occasionSoon = daysToOccasion !== null && daysToOccasion <= 3;

  const doneCount = (bucket.data ?? []).filter((b) => b.status === "done").length;
  const dreamingCount = (bucket.data ?? []).filter((b) => b.status === "dreaming").length;
  const dream = useMemo(() => {
    const d = (bucket.data ?? []).filter((b) => b.status === "dreaming");
    return d.length ? d[Math.floor(Math.random() * d.length)] : null;
  }, [bucket.data]);

  const gItems = gifts.data?.items ?? [];
  const waiting = gItems.find((g) => g.direction === "them" && g.status === "received") ?? null;
  const activeCount = gItems.filter((g) => !["declined", "archived"].includes(g.status)).length;
  const goodDeeds = gItems.filter((g) => g.status === "complete").length;
  const lastDeed = gItems.find((g) => g.status === "complete") ?? null;

  const nItems = notes.data ?? [];
  const unread = nItems.filter((n) => !n.mine && !n.readByRecipient).length;
  const latest = nItems[0] ?? null;
  const daysAgo = latest
    ? Math.max(0, Math.round((Date.now() - new Date(latest.createdAt).getTime()) / 86_400_000))
    : null;

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
      <PreviewCard
        label={COPY.home.cardDreamsTitle}
        title={dream ? `🌌 ${dream.title}` : COPY.home.dreamsEmpty}
        meta={dream ? COPY.home.dreamsMeta(dreamingCount, doneCount) : ""}
        onClick={() => onOpen("bucket")}
      />
      <PreviewCard
        label={COPY.home.cardGiftsTitle}
        warm={!!waiting}
        title={waiting ? `🎁 ${waiting.gesture}` : lastDeed ? `🎁 ${lastDeed.gesture}` : COPY.home.giftsEmpty}
        meta={waiting ? COPY.home.giftsWaitingMeta : lastDeed ? COPY.home.giftsMeta(activeCount, goodDeeds) : ""}
        onClick={() => onOpen("gifts")}
      />
      <PreviewCard
        label={COPY.home.cardNotesTitle}
        title={latest ? COPY.home.notesMetaNew(unread, daysAgo ?? 0) : COPY.home.notesEmpty}
        meta=""
        onClick={() => onOpen("notes")}
      />
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

/** Variant-A preview card: indistinguishable from the ambient cards; the only
 *  accent cue is the meta line. `warm` swaps .card → .hero-warm (used when a
 *  gift is waiting, to draw the eye to the action). */
function PreviewCard({
  label,
  title,
  meta,
  warm = false,
  onClick,
}: {
  label: string;
  title: string;
  meta?: string;
  warm?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={warm ? "hero-warm" : "card"}
      style={{ border: "none", cursor: "pointer", textAlign: "left" }}
    >
      <div className="section-label" style={{ margin: "0 0 4px" }}>{label}</div>
      <div className="card-title">{title}</div>
      {meta ? (
        <div className="meta" style={warm ? { color: "var(--tg-warm)" } : undefined}>{meta}</div>
      ) : null}
    </button>
  );
}
