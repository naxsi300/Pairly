import { useMemo } from "react";
import { endpoints, useApi } from "../sdk/api";
import type { GiftsResponse, LoveNoteItem, MoodResponse, QOTDResponse } from "../sdk/api";
import type { BucketItem, Countdown } from "../types";
import { countdownDisplay, countdownEmoji, localDayDelta, nextMilestone, nextOccurrence } from "../lib/format";
import type { Destination } from "../components/MoreSheet";
import { Rituals } from "../components/Rituals";
import { CountdownStrip } from "../components/CountdownStrip";
import { CoupleChallenge, Gratitude } from "../components/Ambient";
import { MoodCard } from "../components/home-cards/MoodCard";
import { OccasionCard, type Occasion } from "../components/home-cards/OccasionCard";
import { QotdCard } from "../components/home-cards/QotdCard";
import { DreamsCard } from "../components/home-cards/DreamsCard";
import { GiftsCard } from "../components/home-cards/GiftsCard";
import { NotesCard } from "../components/home-cards/NotesCard";

/** Home — R-warm dashboard: countdown strip + six live cards (mood, next occasion,
 *  QOTD, dreams, gifts, notes) + rituals / weekly challenge / gratitude. Each card
 *  is a rich, themed component (auto light/dark via --tg-* tokens). */
export function Home({ onOpen }: { onOpen: (d: Destination) => void }) {
  const mood = useApi<MoodResponse>(endpoints.getMood);
  const qotd = useApi<QOTDResponse>(endpoints.getQotd);
  const cds = useApi<Countdown[]>(endpoints.listCountdowns);
  const bucket = useApi<BucketItem[]>(endpoints.listBucket);
  const gifts = useApi<GiftsResponse>(endpoints.listGifts);
  const notes = useApi<LoveNoteItem[]>(endpoints.listLoveNotes);

  const occasion = nearestOccasion(cds.data);
  const occasionDate = occasion ? new Date(occasion.at) : null;
  // Calendar-day delta (midnight-to-midnight) — matches what Countdowns shows,
  // so the OccasionCard numeral never disagrees with other counts.
  const daysToOccasion = occasionDate ? localDayDelta(occasionDate, new Date()) : null;
  const occasionSoon = daysToOccasion !== null && daysToOccasion <= 3;
  const occasionProp: Occasion | null = occasion
    ? {
        emoji: occasion.emoji,
        label: occasion.label,
        // Context line = the date itself, not a second "через N дн." that could
        // drift out of sync with the numeral.
        sub: new Date(occasion.at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
        daysToOccasion,
        occasionSoon,
      }
    : null;

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

  const nItems = notes.data ?? [];
  const unread = nItems.filter((n) => !n.mine && !n.readByRecipient).length;
  const latest = nItems[0] ?? null;
  // Calendar-day delta (local-midnight anchored) — matches every other
  // day-based count in the app and avoids the "1 dн. назад" drift that the
  // raw-ms Math.round had near midnight / across TZs.
  const daysAgo = latest ? Math.max(0, localDayDelta(new Date(latest.createdAt), new Date())) : null;

  return (
    <div className="app-scroll mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
      <CountdownStrip items={cds.data ?? []} />

      <MoodCard mood={mood.data} onClick={() => onOpen("mood")} />
      <OccasionCard occasion={occasionProp} onClick={() => onOpen("countdowns")} />
      <QotdCard qotd={qotd.data} onClick={() => onOpen("qotd")} />

      <Rituals />
      <CoupleChallenge />
      <Gratitude />

      <DreamsCard
        dream={dream}
        dreamingCount={dreamingCount}
        doneCount={doneCount}
        onClick={() => onOpen("bucket")}
      />
      <GiftsCard
        waiting={waiting}
        activeCount={activeCount}
        goodDeeds={goodDeeds}
        onClick={() => onOpen("gifts")}
      />
      <NotesCard unread={unread} latestDaysAgo={daysAgo} onClick={() => onOpen("notes")} />
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
