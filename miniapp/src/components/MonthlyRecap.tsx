import { COPY } from "../copy";

interface MonthlyRecapProps {
  /** Calendar-days since the pair linked. The recap is hidden until this passes 7. */
  togetherDays: number;
  /** QOTD answers total (read off /api/pair/stats.totalQotdAnswers). */
  qotd: number;
  /** Gift "completed" count — i.e. good deeds that were both sent and redeemed. */
  deeds: number;
  /** Bucket items currently in `done` status (dreams that came true). */
  dreams: number;
}

/** Warm monthly-recap card on the Home dashboard. Sits between the loading pills
 *  and the content cards. It is intentionally low-CTR (no button, no link) — the
 *  user-facing read is "look how much you've done together" rather than "go
 *  somewhere". Hidden until the pair has been together for at least 7 days so
 *  very-new pairs aren't reminded that they have 0 of everything.
 *
 *  Layered card: warm-wash gradient background, an upper-LEFT section label
 *  (the gallery's "section-label warm" rhythm), a card-title body line, and a
 *  small ✨ decorative anchor in the top-right corner. */
export function MonthlyRecap({ togetherDays, qotd, deeds, dreams }: MonthlyRecapProps) {
  // Brief contract: under-threshold pairs see no recap at all.
  if (togetherDays < 7) return null;

  return (
    <section
      aria-label={COPY.home.recapTitle}
      data-testid="monthly-recap"
      style={{
        position: "relative",
        padding: "16px 18px 14px",
        borderRadius: 20,
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 16%, var(--tg-sec)) 0%, var(--tg-sec) 100%)",
        border:
          "1px solid color-mix(in srgb, var(--tg-warm) 30%, transparent)",
        boxShadow:
          "0 6px 18px color-mix(in srgb, var(--tg-warm) 10%, transparent)",
        overflow: "hidden",
      }}
    >
      {/* Section label (warm) — the gallery's section-label warm rhythm, top-left */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--tg-warm)",
          marginBottom: 6,
        }}
      >
        {COPY.home.recapTitle}
      </div>

      {/* Card-title body — the actual recap line */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: -0.2,
          color: "var(--tg-text)",
          lineHeight: 1.3,
        }}
      >
        {COPY.home.recapBody(qotd, deeds, dreams)}
      </div>

      {/* Decorative ✨ anchor — top-right; purely atmospheric. aria-hidden so
          screen-readers don't announce it as a separate element. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          fontSize: 22,
          opacity: 0.55,
        }}
      >
        ✨
      </div>
    </section>
  );
}
