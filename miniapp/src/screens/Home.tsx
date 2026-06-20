import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import type { MoodResponse, QOTDResponse } from "../sdk/api";
import type { Countdown, WishlistItem } from "../types";
import { countdownDisplay, countdownEmoji } from "../lib/format";
import { DateWheel } from "../components/DateWheel";
import { MoreSheet, type Destination } from "../components/MoreSheet";
import { Rituals } from "../components/Rituals";
import { haptic } from "../sdk/twa";

/** Home — 1:1 with the R-warm gallery "Ваш уголок": heading + warm hero CTA +
 * ambient cards (mood, next occasion, QOTD, rituals). */
export function Home({
  onOpen,
  onOpenTab,
}: {
  onOpen: (d: Destination) => void;
  onOpenTab: (tab: "wishlist" | "mood") => void;
}) {
  const stats = useApi(endpoints.getPairStats);
  const mood = useApi<MoodResponse>(endpoints.getMood);
  const qotd = useApi<QOTDResponse>(endpoints.getQotd);
  const cds = useApi<Countdown[]>(endpoints.listCountdowns);
  const wl = useApi<WishlistItem[]>(endpoints.listWishlist);
  const [wheel, setWheel] = useState(false);
  const [more, setMore] = useState(false);

  const days = stats.data?.togetherDays ?? 0;
  const openCount = (wl.data ?? []).filter((i) => i.status === "open").length;
  const doneCount = (wl.data ?? []).filter((i) => i.status === "done").length;
  const nearest = (cds.data ?? [])
    .filter((c) => new Date(c.targetDate).getTime() > Date.now())
    .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())[0];
  const daysToNearest = nearest
    ? Math.round((new Date(nearest.targetDate).getTime() - Date.now()) / 86_400_000)
    : null;
  const occasionSoon = daysToNearest !== null && daysToNearest <= 3;

  return (
    <div className="app-scroll mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
      <h1 className="heading">{COPY.home.heading}</h1>
      <div className="sub">{COPY.home.greeting(days)}</div>

      {/* Date-wheel warm hero CTA */}
      <button type="button" onClick={() => { haptic("light"); setWheel(true); }} className="hero-warm" style={{ textAlign: "center", padding: "24px 20px", border: "none", cursor: "pointer" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎡</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tg-text)" }}>{COPY.home.wheelSub}</div>
        <div style={{ fontSize: 14, color: "var(--tg-hint)", marginTop: 4 }}>{COPY.home.wheelCta}</div>
      </button>

      {/* Together stats row */}
      {days > 0 ? (
        <div className="stat-row">
          <div className="stat">
            <div className="stat-big">{days}</div>
            <div className="stat-label">дней вместе</div>
          </div>
          <div className="stat">
            <div className="stat-big">{openCount}</div>
            <div className="stat-label">хотелок в списке</div>
          </div>
          <div className="stat">
            <div className="stat-big">{doneCount}</div>
            <div className="stat-label">сделано</div>
          </div>
        </div>
      ) : null}

      {/* Mood ambient */}
      <button type="button" onClick={() => onOpenTab("mood")} className="card" style={{ border: "none", cursor: "pointer", textAlign: "left" }}>
        <div className="section-label" style={{ margin: "0 0 4px" }}>{COPY.home.cardMoodTitle}</div>
        <MoodSummary mood={mood.data} />
      </button>

      {/* Next occasion — warm hero when soon */}
      <button type="button" onClick={() => onOpen("countdowns")} className={occasionSoon ? "hero-warm" : "card"} style={{ border: "none", cursor: "pointer", textAlign: "left" }}>
        <div className="section-label" style={{ margin: "0 0 4px" }}>{COPY.home.cardNextOccasionTitle}</div>
        <div className="card-title">
          {nearest
            ? `${countdownEmoji(nearest)} ${nearest.label} · ${countdownDisplay(nearest)}`
            : COPY.home.noOccasion}
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

      {/* Wishlist glance → Wishlist tab */}
      <button type="button" onClick={() => onOpenTab("wishlist")} className="card" style={{ border: "none", cursor: "pointer", textAlign: "left" }}>
        <div className="section-label" style={{ margin: "0 0 4px" }}>Вишлист</div>
        <div className="card-title">{openCount > 0 ? `${openCount} в списке · ${doneCount} сделано` : "Добавьте первую хотелку"}</div>
      </button>

      {/* More */}
      <button type="button" onClick={() => setMore(true)} className="btn-ghost">{COPY.home.more} →</button>

      <DateWheel open={wheel} onClose={() => setWheel(false)} />
      <MoreSheet open={more} onClose={() => setMore(false)} onPick={(d) => { setMore(false); onOpen(d); }} />
    </div>
  );
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
