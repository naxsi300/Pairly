import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import type { MoodResponse, QOTDResponse } from "../sdk/api";
import type { Countdown, WishlistItem } from "../types";
import { countdownDisplay, countdownEmoji } from "../lib/format";
import { Card } from "../components/Card";
import { DateWheel } from "../components/DateWheel";
import { MoreSheet, type Destination } from "../components/MoreSheet";
import { Rituals } from "../components/Rituals";
import { haptic } from "../sdk/twa";

/** Home dashboard — the front door tying ambient cards together (R-warm). */
export function Home({ onOpen }: { onOpen: (d: Destination) => void }) {
  const stats = useApi(endpoints.getPairStats);
  const mood = useApi<MoodResponse>(endpoints.getMood);
  const qotd = useApi<QOTDResponse>(endpoints.getQotd);
  const cds = useApi<Countdown[]>(endpoints.listCountdowns);
  const wl = useApi<WishlistItem[]>(endpoints.listWishlist);
  const [wheel, setWheel] = useState(false);
  const [more, setMore] = useState(false);

  const days = stats.data?.togetherDays ?? 0;
  const openWishlist = (wl.data ?? []).filter((i) => i.status === "open");
  const nearest = (cds.data ?? [])
    .filter((c) => new Date(c.targetDate).getTime() > Date.now())
    .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())[0];
  // "Soon" nudge: highlight when the nearest occasion is within 3 days.
  const daysToNearest = nearest
    ? Math.round((new Date(nearest.targetDate).getTime() - Date.now()) / 86_400_000)
    : null;
  const occasionSoon = daysToNearest !== null && daysToNearest <= 3;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
      <h1 className="rw-heading">{COPY.home.heading}</h1>
      <p className="rw-sub">{COPY.home.greeting(days)}</p>

      {/* Date-wheel CTA (warm hero) */}
      <button
        type="button"
        onClick={() => { haptic("light"); setWheel(true); }}
        className="rw-hero-warm text-left"
      >
        <p className="text-base font-semibold text-tg-text">{COPY.home.wheelCta}</p>
        <p className="rw-sub">{COPY.home.wheelSub}</p>
      </button>

      {/* Open wishlist quick glance */}
      <Card>
        <button
          type="button"
          onClick={() => onOpen("bucket")}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-base text-tg-text">
            {openWishlist.length > 0
              ? `${openWishlist.length} ${openWishlist.length === 1 ? "хотелка" : "хотелок"} в списке`
              : "Хотите что-то попробовать?"}
          </span>
          <span className="rw-meta">→</span>
        </button>
      </Card>

      {/* Mood ambient */}
      <Card>
        <p className="rw-section-label" style={{ margin: "0 0 6px" }}>{COPY.home.cardMoodTitle}</p>
        <MoodSummary mood={mood.data} />
      </Card>

      {/* Next occasion — warm hero when it's soon (≤3 days), else a calm card. */}
      {nearest && occasionSoon ? (
        <button
          type="button"
          onClick={() => onOpen("countdowns")}
          className="rw-hero-warm text-left"
        >
          <p className="rw-section-label" style={{ margin: "0 0 6px" }}>{COPY.home.cardNextOccasionTitle}</p>
          <p className="text-base text-tg-text">
            {countdownEmoji(nearest)} {nearest.label} · {countdownDisplay(nearest)}
          </p>
        </button>
      ) : (
        <Card>
          <button type="button" onClick={() => onOpen("countdowns")} className="w-full text-left">
            <p className="rw-section-label" style={{ margin: "0 0 6px" }}>{COPY.home.cardNextOccasionTitle}</p>
            <p className="text-base text-tg-text">
              {nearest
                ? `${countdownEmoji(nearest)} ${nearest.label} · ${countdownDisplay(nearest)}`
                : COPY.home.noOccasion}
            </p>
          </button>
        </Card>
      )}

      {/* QOTD */}
      <Card>
        <button type="button" onClick={() => onOpen("qotd")} className="w-full text-left">
          <p className="rw-section-label" style={{ margin: "0 0 6px" }}>{COPY.home.cardQotdTitle}</p>
          <p className="text-base text-tg-text">{qotd.data?.question?.text ?? "…"}</p>
          <p className="rw-meta mt-1">
            {qotdStatus(qotd.data)}
          </p>
        </button>
      </Card>

      {/* Weekly rituals */}
      <Rituals />

      <button
        type="button"
        onClick={() => setMore(true)}
        className="self-center text-sm"
        style={{ color: "var(--m3-primary)" }}
      >
        {COPY.home.more} →
      </button>

      <DateWheel open={wheel} onClose={() => setWheel(false)} />
      <MoreSheet
        open={more}
        onClose={() => setMore(false)}
        onPick={(d) => { setMore(false); onOpen(d); }}
      />
    </div>
  );
}

function MoodSummary({ mood }: { mood: MoodResponse | null | undefined }) {
  if (!mood) return <p className="text-base text-tg-hint">…</p>;
  const mine = mood.self?.mood ?? COPY.mood.notSet;
  const theirs = mood.partner?.mood ?? COPY.mood.notSet;
  return (
    <p className="text-base text-tg-text">
      {COPY.mood.youLabel}: {mine} · {mood.partnerName || COPY.mood.partnerLabel}: {theirs}
    </p>
  );
}

/** QOTD reveal-state hint shown under the question on the Home card. */
function qotdStatus(q: QOTDResponse | null | undefined): string {
  if (!q || !q.question) return COPY.home.qotdHint;
  if (q.myAnswer && q.partnerAnswered) return COPY.home.qotdBothAnswered;
  if (q.myAnswer && !q.partnerAnswered) return COPY.home.qotdWaitingPartner;
  return COPY.home.qotdYouWaiting;
}
