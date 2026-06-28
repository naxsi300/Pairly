import type { CSSProperties } from "react";
import { COPY } from "../../copy";
import type { QOTDResponse } from "../../sdk/api";

/**
 * QotdCard — the chosen "Diagonal you/partner split" design for the home feed.
 * Two mirrored halves — one for you, one for partner — each a small identity
 * orb that flips from '?' to ✓ as the answer lands.
 *
 * Token map (gallery -> app):
 *   --bg    -> var(--tg-bg)
 *   --sec   -> var(--tg-sec)
 *   --warm  -> var(--tg-warm)
 *   --text  -> var(--tg-text)
 *   --hint  -> var(--tg-hint)
 *   --button-> var(--tg-button)
 *
 * The card auto-themes for light/dark via these --tg-* tokens.
 */

export interface QotdCardProps {
  qotd: QOTDResponse | null | undefined;
  onClick: () => void;
}

// Card-local strings. The controller will fold these into COPY.home later.
const STR = {
  // "Вопрос дня" header label echoing the chosen design's pill.
  header: "вопрос дня",
  today: "сегодня",
  // The pulse-line caption between the two orbs.
  and: "и",
  // Orb status labels.
  yourTurn: "твой ход",
  answered: "ответила",
  // Default partner-verb (when partnerName unknown). Feminine singular.
  answeredNeuter: "ответил(а)",
  // Default "you" identity letter when no name.
  youLetter: "я",
  partnerLetter: "о",
  // Footer CTA — used when the partner's answer can be revealed.
  revealHint: "нажми, чтобы вскрыть её ответ",
  openCta: "открыть",
  // A11y labels.
  ariaWithQuestion: (q: string) => `Вопрос дня: ${q}. Открыть.`,
  ariaEmpty: "Вопрос дня — пока нет. Открыть.",
  // Empty/placeholder copy.
  emptyTitle: "сегодня без вопроса",
  emptyHint: "зайдите позже или предложите свой — скоро появится",
  // Loading copy.
  loading: "загружается…",
};

const buttonReset: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  textAlign: "left",
  width: "100%",
  cursor: "pointer",
  color: "inherit",
};

const surfaceStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  boxSizing: "border-box",
  padding: "18px 18px 16px",
  borderRadius: 20,
  background: "var(--tg-sec)",
  boxShadow: "0 6px 22px color-mix(in srgb, #000 22%, transparent)",
  overflow: "hidden",
  fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
  color: "var(--tg-text)",
};

// Soft diagonal warm wash — the design's "alive" cue.
const washStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 14%, transparent) 0%, transparent 55%)",
  pointerEvents: "none",
};

const contentStyle: CSSProperties = {
  position: "relative",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const headerLeftStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const headerEmojiStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1,
};

const headerLabelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--tg-warm)",
  fontWeight: 700,
};

const headerDateStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--tg-hint)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const questionStyle: CSSProperties = {
  fontSize: 17,
  lineHeight: 1.3,
  fontWeight: 600,
  color: "var(--tg-text)",
  margin: "0 0 16px",
  letterSpacing: "-0.01em",
};

const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 8,
};

const orbColStyle = (isYou: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: "12px 6px",
  borderRadius: 14,
  background: isYou
    ? "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))"
    : "color-mix(in srgb, #ffd0a8 4%, var(--tg-sec))",
  boxShadow: isYou
    ? "0 0 0 1px color-mix(in srgb, var(--tg-warm) 20%, transparent) inset"
    : "0 0 0 1px color-mix(in srgb, #ffd0a8 18%, transparent) inset",
});

const orbStyle = (isYou: boolean): CSSProperties => ({
  position: "relative",
  width: 42,
  height: 42,
  borderRadius: "50%",
  background: isYou
    ? `radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--tg-warm) 70%, #fff), color-mix(in srgb, var(--tg-warm) 40%, var(--tg-sec)))`
    : `radial-gradient(circle at 30% 30%, #ffe6c8, color-mix(in srgb, #ffd0a8 35%, var(--tg-sec)))`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  fontWeight: 800,
  // The orb letter always reads in the dark text color — it's a frosted
  // highlight, not a themed surface. (Partner's warm peach face is the
  // closest the design comes to a "dark text" surface, hence the literal
  // dark hex used here for the letter.)
  color: "#1c1c1e",
  boxShadow: isYou
    ? "0 4px 12px color-mix(in srgb, var(--tg-warm) 30%, transparent)"
    : "0 4px 12px color-mix(in srgb, #000 35%, transparent)",
});

const orbBadgeStyle = (isYou: boolean, hasAnswer: boolean): CSSProperties => ({
  position: "absolute",
  bottom: -2,
  right: -2,
  width: 16,
  height: 16,
  borderRadius: "50%",
  // You-side: badge is the dark surface (tg-bg) with a coral "?". Partner-side
  // when answered: warm coral filled disc with a dark check.
  background: isYou
    ? "var(--tg-bg)"
    : hasAnswer
      ? "var(--tg-warm)"
      : "var(--tg-bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: `2px solid var(--tg-sec)`,
});

const orbBadgeTextStyle: CSSProperties = {
  fontSize: 9,
  // Letter is dark on the warm badge and hint-colored on the dark badge.
  color: "var(--tg-text)",
  fontWeight: 900,
  lineHeight: 1,
};

const orbLabelStyle = (isYou: boolean): CSSProperties => ({
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: isYou ? "var(--tg-warm)" : "var(--tg-hint)",
  fontWeight: isYou ? 700 : 600,
});

const vsColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
};

const vsLineStyle: CSSProperties = {
  width: 1,
  height: 18,
  background: "color-mix(in srgb, var(--tg-warm) 30%, transparent)",
};

const vsAndStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--tg-hint)",
};

const footerRowStyle: CSSProperties = {
  marginTop: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const footerHintStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--tg-hint)",
};

const footerCtaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  color: "var(--tg-warm)",
  fontWeight: 700,
};

// ---- Empty / loading placeholders ----------------------------------------

const emptyQuestionStyle: CSSProperties = {
  ...questionStyle,
  color: "var(--tg-hint)",
  fontWeight: 500,
  fontStyle: "italic",
};

const emptyHintStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--tg-hint)",
  margin: "-4px 0 16px",
  lineHeight: 1.3,
};

// ---- Component ------------------------------------------------------------

/**
 * Pick the status line for the footer.
 * Order of precedence:
 *   1. Both answered          -> qotdBothAnswered
 *   2. I answered, waiting    -> qotdWaitingPartner
 *   3. I haven't, partner has -> qotdHint (gently nudge me to answer)
 *   4. I haven't, no partner  -> qotdYouWaiting
 *   5. Nothing to show        -> empty fallback
 */
function statusLine(q: QOTDResponse | null | undefined): string {
  // Truly no data yet (endpoint hasn't returned) — show the loading line so
  // the card doesn't flash an empty footer.
  if (!q) return STR.loading;
  // Server explicitly says "no question today" — invite the user to suggest
  // their own rather than pretending we're still fetching.
  if (!q.question) return COPY.home.qotdYouWaiting;
  if (q.myAnswer && q.partnerAnswered) return COPY.home.qotdBothAnswered;
  if (q.myAnswer && !q.partnerAnswered) return COPY.home.qotdWaitingPartner;
  if (!q.myAnswer && q.partnerAnswered) return COPY.home.qotdHint;
  return COPY.home.qotdYouWaiting;
}

/** The footer hint to the right of the chevron. Only used when the partner
 *  has answered and we're waiting on us to reveal — for other states the
 *  meta line above already carries the call to action. */
function revealHint(q: QOTDResponse | null | undefined): string | null {
  if (!q || !q.question) return null;
  if (q.partnerAnswered && !q.myAnswer) return STR.revealHint;
  return null;
}

/** First letter of the partner name (lowercased), with sane fallbacks. */
function partnerInitial(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return STR.partnerLetter;
  // First grapheme. Russian names start with a capital Cyrillic letter.
  return trimmed.charAt(0).toLowerCase();
}

export function QotdCard({ qotd, onClick }: QotdCardProps) {
  const hasQuestion = !!qotd?.question;
  const questionText = qotd?.question?.text ?? STR.emptyTitle;
  const myAnswered = !!qotd?.myAnswer;
  const partnerAnswered = !!qotd?.partnerAnswered;
  const a11y = hasQuestion
    ? STR.ariaWithQuestion(questionText)
    : STR.ariaEmpty;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={a11y}
      style={buttonReset}
    >
      <div style={surfaceStyle}>
        <div aria-hidden="true" style={washStyle} />

        <div style={contentStyle}>
          {/* Header — section label + relative date */}
          <div style={headerRowStyle}>
            <div style={headerLeftStyle}>
              <span style={headerEmojiStyle} aria-hidden="true">
                🫶
              </span>
              <span style={headerLabelStyle}>{STR.header}</span>
            </div>
            <div style={headerDateStyle}>{STR.today}</div>
          </div>

          {/* Question text (or muted placeholder) */}
          {hasQuestion ? (
            <div style={questionStyle}>{questionText}</div>
          ) : (
            <>
              <div style={emptyQuestionStyle}>{STR.emptyTitle}</div>
              <div style={emptyHintStyle}>{STR.emptyHint}</div>
            </>
          )}

          {/* Two answer orbs side by side, each reflects identity + state */}
          <div style={splitStyle}>
            {/* Me */}
            <div style={orbColStyle(true)}>
              <div style={orbStyle(true)}>
                <span aria-hidden="true">{STR.youLetter}</span>
                <div aria-hidden="true" style={orbBadgeStyle(true, myAnswered)}>
                  <span style={orbBadgeTextStyle}>
                    {myAnswered ? "✓" : "?"}
                  </span>
                </div>
              </div>
              <div style={orbLabelStyle(true)}>
                {myAnswered ? STR.answeredNeuter : STR.yourTurn}
              </div>
            </div>

            {/* VS / pulse line */}
            <div style={vsColStyle} aria-hidden="true">
              <div style={vsLineStyle} />
              <div style={vsAndStyle}>{STR.and}</div>
              <div style={vsLineStyle} />
            </div>

            {/* Partner */}
            <div style={orbColStyle(false)}>
              <div style={orbStyle(false)}>
                <span aria-hidden="true">{partnerInitial(qotd?.partnerName)}</span>
                <div
                  aria-hidden="true"
                  style={orbBadgeStyle(false, partnerAnswered)}
                >
                  <span style={orbBadgeTextStyle}>
                    {partnerAnswered ? "✓" : "?"}
                  </span>
                </div>
              </div>
              <div style={orbLabelStyle(false)}>
                {partnerAnswered ? STR.answered : "—"}
              </div>
            </div>
          </div>

          {/* Footer — status line + (optional) reveal CTA */}
          <div style={footerRowStyle}>
            <div style={footerHintStyle}>
              {revealHint(qotd) ?? statusLine(qotd)}
            </div>
            {revealHint(qotd) ? (
              <div style={footerCtaStyle}>
                {STR.openCta} <span aria-hidden="true">→</span>
              </div>
            ) : (
              <div style={footerCtaStyle}>
                <span aria-hidden="true">→</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default QotdCard;
