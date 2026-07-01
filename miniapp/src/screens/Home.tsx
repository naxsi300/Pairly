import { useEffect, useMemo, useState } from "react";
import { endpoints, useApi } from "../sdk/api";
import type { GiftsResponse, LoveNoteItem, MoodResponse, QOTDResponse } from "../sdk/api";
import type { BucketItem, Countdown, WishlistItem } from "../types";
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
import { WelcomeHero } from "../components/WelcomeHero";

const WELCOMED_KEY = "pairly.welcomed";

/** Home — R-warm dashboard: countdown strip + six live cards (mood, next occasion,
 *  QOTD, dreams, gifts, notes) + rituals / weekly challenge / gratitude. Each card
 *  is a rich, themed component (auto light/dark via --tg-* tokens). */
export function Home({ onOpen }: { onOpen: (d: Destination) => void }) {
  const mood = useApi<MoodResponse>(endpoints.getMood);
  const qotd = useApi<QOTDResponse>(endpoints.getQotd);
  const cds = useApi<Countdown[]>(endpoints.listCountdowns);
  const bucket = useApi<BucketItem[]>(endpoints.listBucket);
  const wishlist = useApi<WishlistItem[]>((signal) => endpoints.listWishlist(signal, false));
  const gifts = useApi<GiftsResponse>(endpoints.listGifts);
  const notes = useApi<LoveNoteItem[]>(endpoints.listLoveNotes);

  // Aggregate loading/error across the data hooks so a single banner can
  // surface any problem without each card silently disappearing.
  const allHooks = [mood, qotd, cds, bucket, wishlist, gifts, notes] as const;
  const anyError = allHooks.find((h) => h.error) ?? null;
  const anyLoadingNoData = allHooks.some((h) => h.loading && h.data == null) && !anyError;

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
  // Stable per local day + list length so it doesn't re-randomize on every
  // data refresh / tab return. Hash is computed once per render and is
  // stable within the same calendar day; deps stay [bucket.data] so it
  // refreshes when the underlying list changes (new dreams, status flips).
  const dream = useMemo(() => {
    const d = (bucket.data ?? []).filter((b) => b.status === "dreaming");
    if (d.length === 0) return null;
    const dayKey = `${new Date().toDateString()}|${d.length}`;
    let hash = 0;
    for (let i = 0; i < dayKey.length; i++) {
      hash = (hash * 31 + dayKey.charCodeAt(i)) | 0;
    }
    return d[Math.abs(hash) % d.length];
  }, [bucket.data]);

  const gItems = gifts.data?.items ?? [];
  const waiting = gItems.find((g) => g.direction === "them" && g.status === "received") ?? null;
  const activeCount = gItems.filter((g) => !["declined", "archived"].includes(g.status)).length;
  const goodDeeds = gItems.filter((g) => g.status === "complete").length;

  const nItems = notes.data ?? [];
  const unread = nItems.filter((n) => !n.mine && !n.readByRecipient).length;
  // "последняя" should be the last note FROM the partner, not the user's
  // own sent note (otherwise the card ages by the user's own activity and
  // the partner's incoming note is invisible).
  const latest = nItems.find((n) => !n.mine) ?? nItems[0] ?? null;
  // Calendar-day delta (local-midnight anchored) — matches every other
  // day-based count in the app and avoids the "1 dн. назад" drift that the
  // raw-ms Math.round had near midnight / across TZs.
  // localDayDelta is target−now → negative for a past note; negate for elapsed
  // days. (The Math.max(0, …) on the signed delta returned 0 for every past
  // note, so the card always read «последняя 0 дн. назад».)
  const daysAgo = latest ? Math.max(0, -localDayDelta(new Date(latest.createdAt), new Date())) : null;

  // First-run welcome hero: show only when the three "content" streams are
  // all empty AND the user hasn't dismissed it before. Dismissal sticks per
  // device (no pairId is reliably available here — keyed by plain key, as
  // the brief instructs). Treats `loading` as "not empty yet" so the hero
  // doesn't flash during the initial fetch.
  const [welcomed, setWelcomed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WELCOMED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const bucketEmpty = (bucket.data ?? []).length === 0;
  const wishlistEmpty = (wishlist.data ?? []).length === 0;
  const notesEmpty = (notes.data ?? []).length === 0;
  const isFirstRun =
    !bucket.loading && !wishlist.loading && !notes.loading &&
    bucketEmpty && wishlistEmpty && notesEmpty;
  const showWelcome = isFirstRun && !welcomed;

  // Persist dismissal (best-effort; storage may throw in private mode).
  const dismissWelcome = () => {
    try {
      localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      /* swallow — state still updates in-memory */
    }
    setWelcomed(true);
  };

  // When the user has actually taken an action (any of the three streams
  // now has content), hide the hero even if they didn't tap the dismiss
  // button. We deliberately do NOT auto-dismiss on "loading finished" —
  // a fresh empty load is exactly when the hero should appear, so we
  // wait until at least one stream has length>0.
  const hasEngagement =
    (bucket.data?.length ?? 0) > 0 ||
    (wishlist.data?.length ?? 0) > 0 ||
    (notes.data?.length ?? 0) > 0;
  useEffect(() => {
    if (hasEngagement && !welcomed) {
      // No persist here — they've engaged with the app, so subsequent
      // empties should still feel fresh if data ever churns.
      setWelcomed(true);
    }
  }, [hasEngagement, welcomed]);

  return (
    <div className="app-scroll mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
      <CountdownStrip items={cds.data ?? []} />

      {anyError ? (
        <button
          type="button"
          onClick={() => anyError.refetch()}
          aria-label="Не удалось обновить — нажмите, чтобы повторить"
          style={{
            alignSelf: "center",
            padding: "6px 12px",
            borderRadius: 999,
            background:
              "color-mix(in srgb, var(--tg-danger) 14%, var(--tg-sec))",
            border:
              "1px solid color-mix(in srgb, var(--tg-danger) 35%, transparent)",
            color: "var(--tg-danger)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Не удалось обновить — потянитe, чтобы повторить
        </button>
      ) : anyLoadingNoData ? (
        <div
          aria-live="polite"
          style={{
            alignSelf: "center",
            padding: "6px 12px",
            borderRadius: 999,
            background:
              "color-mix(in srgb, var(--tg-hint) 12%, var(--tg-sec))",
            border:
              "1px solid color-mix(in srgb, var(--tg-hint) 25%, transparent)",
            color: "var(--tg-hint)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          обновляем…
        </div>
      ) : null}

      {showWelcome ? (
        <WelcomeHero
          onGift={() => {
            dismissWelcome();
            onOpen("gifts");
          }}
          onForward={() => {
            // Bot deep-link isn't wired through TWA here; the wishlist is
            // where forwarded posts surface, so we route the user there as
            // the closest affordance.
            dismissWelcome();
            onOpen("wishlist");
          }}
          onNote={() => {
            dismissWelcome();
            onOpen("notes");
          }}
          onDismiss={dismissWelcome}
        />
      ) : null}

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
        partnerName={gifts.data?.partnerName ?? null}
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
