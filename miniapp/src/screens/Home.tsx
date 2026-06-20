import { useEffect, useRef, useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import type { MoodResponse, QOTDResponse } from "../sdk/api";
import type { Countdown } from "../types";
import { countdownDisplay, countdownEmoji, nextMilestone, nextOccurrence } from "../lib/format";
import { useIsPro } from "../lib/useIsPro";
import { DateWheel } from "../components/DateWheel";
import { AdminMenu } from "../components/AdminMenu";
import { MoreSheet, type Destination } from "../components/MoreSheet";
import { Rituals } from "../components/Rituals";
import { CountdownStrip } from "../components/CountdownStrip";
import { CoupleChallenge, Gratitude } from "../components/Ambient";
import { haptic } from "../sdk/twa";

/** Home — R-warm dashboard: warm hero CTA + dynamic countdown strip (the pair's
 * "together since" timeline) + ambient cards (mood, next occasion, QOTD, rituals). */
export function Home({
  onOpen,
  onOpenTab,
}: {
  onOpen: (d: Destination) => void;
  onOpenTab: (tab: "wishlist" | "mood") => void;
}) {
  const mood = useApi<MoodResponse>(endpoints.getMood);
  const qotd = useApi<QOTDResponse>(endpoints.getQotd);
  const cds = useApi<Countdown[]>(endpoints.listCountdowns);
  const { isPro, setPro, refresh } = useIsPro();
  const [wheel, setWheel] = useState(false);
  const [more, setMore] = useState(false);
  const [admin, setAdmin] = useState(false);

  // Hidden admin trigger: open via #admin deep link (on load OR hash change).
  useEffect(() => {
    const check = () => {
      if (window.location.hash.replace("#", "").toLowerCase() === "admin") {
        setAdmin(true);
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  // Long-press on the 🎡 hero → admin menu (a normal tap still opens the wheel).
  const longRef = useRef<number | null>(null);
  const didLong = useRef(false);
  const startLong = () => {
    didLong.current = false;
    longRef.current = window.setTimeout(() => {
      didLong.current = true;
      setAdmin(true);
      haptic("light");
    }, 600);
  };
  const cancelLong = () => {
    if (longRef.current !== null) {
      clearTimeout(longRef.current);
      longRef.current = null;
    }
  };

  const occasion = nearestOccasion(cds.data);
  const daysToOccasion = occasion
    ? Math.round((occasion.at - Date.now()) / 86_400_000)
    : null;
  const occasionSoon = daysToOccasion !== null && daysToOccasion <= 3;

  return (
    <div className="app-scroll mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
      {/* Date-wheel warm hero CTA (long-press → hidden admin menu) */}
      <button
        type="button"
        onPointerDown={startLong}
        onPointerUp={cancelLong}
        onPointerLeave={cancelLong}
        onClick={() => {
          if (didLong.current) {
            didLong.current = false;
            return; // long-press already opened admin; don't also open the wheel
          }
          haptic("light");
          setWheel(true);
        }}
        className="hero-warm"
        style={{ textAlign: "center", padding: "24px 20px", border: "none", cursor: "pointer" }}
      >
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎡</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tg-text)" }}>{COPY.home.wheelSub}</div>
        <div style={{ fontSize: 14, color: "var(--tg-hint)", marginTop: 4 }}>{COPY.home.wheelCta}</div>
      </button>

      {/* Dynamic countdown strip — the pair's elapsed-time timeline */}
      <CountdownStrip items={cds.data ?? []} />

      {/* Mood ambient */}
      <button type="button" onClick={() => onOpenTab("mood")} className="card" style={{ border: "none", cursor: "pointer", textAlign: "left" }}>
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

      {/* More */}
      <button type="button" onClick={() => setMore(true)} className="btn-ghost">{COPY.home.more} →</button>

      <DateWheel
        open={wheel}
        onClose={() => setWheel(false)}
        isPro={isPro}
        onOpenAdmin={() => setAdmin(true)}
      />
      <AdminMenu open={admin} onClose={() => setAdmin(false)} setPro={setPro} refresh={refresh} />
      <MoreSheet open={more} onClose={() => setMore(false)} onPick={(d) => { setMore(false); onOpen(d); }} />
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
