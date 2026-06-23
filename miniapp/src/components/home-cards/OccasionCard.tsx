import type { CSSProperties } from "react";
import { COPY } from "../../copy";

/**
 * OccasionCard — the chosen "giant countdown numeral" design for the home feed.
 * Reproduces the approved visual: a huge tabular number dominates the card,
 * with a dashed-circle "stamp" emoji and a coral "скоро" pill when soon.
 *
 * Token map (gallery -> app): --bg/--sec/--warm/--text/--hint/--button -> --tg-*
 */

export interface Occasion {
  emoji: string;
  label: string;
  /** Sub-line, e.g. "День рождения Ани" or "до 14 июня". */
  sub: string;
  /** Days remaining until the occasion. 0 = today. null = unknown. */
  daysToOccasion: number | null;
  /** When true, the card takes the warmer/pulsing "soon" treatment. */
  occasionSoon: boolean;
}

export interface OccasionCardProps {
  occasion: Occasion | null;
  onClick: () => void;
}

// Card-local copy. The controller will fold these into COPY.home later.
const STR = {
  nearestEvent: "Ближайшее событие",
  soon: "скоро",
  days: "дней",
  today: "сегодня",
  open: "Открыть",
  ariaWithLabel: (label: string) => `Открыть отсчёт: ${label}`,
  ariaEmpty: "Добавить отсчёт",
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

export function OccasionCard({ occasion, onClick }: OccasionCardProps) {
  // Empty state — still tappable, mirrors the "noOccasion" copy contract.
  if (!occasion) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={STR.ariaEmpty}
        style={buttonReset}
      >
        <div style={surfaceStyle(false)}>
          <div style={headerRowStyle}>
            <div style={pillRowStyle}>
              <span style={dotStyle(false)} />
              <span style={headerLabelStyle}>{STR.nearestEvent}</span>
            </div>
          </div>
          <div style={numeralRowStyle}>
            <div style={numeralBlockStyle}>
              <span style={{ ...numeralStyle, fontSize: 56, opacity: 0.6 }}>
                —
              </span>
              <div style={numeralMetaStyle}>
                <span style={metaLineStyle}>{COPY.home.noOccasion}</span>
              </div>
            </div>
            <div style={stampStyle}>
              <span style={stampEmojiStyle}>📅</span>
            </div>
          </div>
          <div style={footerRowStyle}>
            <span style={footerLabelStyle}>{COPY.home.noOccasion}</span>
            <span style={footerCtaStyle}>
              {STR.open} <span style={{ fontSize: 15 }}>→</span>
            </span>
          </div>
        </div>
      </button>
    );
  }

  const isToday = occasion.daysToOccasion === 0;
  const hasNumeral = occasion.daysToOccasion !== null;
  const numeral = isToday
    ? STR.today
    : hasNumeral
      ? String(occasion.daysToOccasion)
      : "—";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={STR.ariaWithLabel(occasion.label)}
      style={buttonReset}
    >
      <div style={surfaceStyle(occasion.occasionSoon)}>
        <div style={headerRowStyle}>
          <div style={pillRowStyle}>
            <span style={dotStyle(occasion.occasionSoon)} />
            <span style={headerLabelStyle}>{STR.nearestEvent}</span>
          </div>
          {occasion.occasionSoon ? (
            <span style={soonPillStyle}>{STR.soon}</span>
          ) : null}
        </div>

        <div style={numeralRowStyle}>
          <div style={numeralBlockStyle}>
            {isToday ? (
              <span style={{ ...numeralStyle, fontSize: 48 }}>{numeral}</span>
            ) : (
              <span style={numeralStyle}>{numeral}</span>
            )}
            <div style={numeralMetaStyle}>
              <span style={metaLineStyle}>
                {isToday ? STR.today : STR.days}
              </span>
              <span style={{ ...metaLineStyle, opacity: 0.7 }}>
                {occasion.sub}
              </span>
            </div>
          </div>
          <div style={stampStyle}>
            <span style={stampEmojiStyle}>{occasion.emoji}</span>
          </div>
        </div>

        <div style={footerRowStyle}>
          <span style={footerLabelStyle}>{occasion.label}</span>
          <span style={footerCtaStyle}>
            {STR.open} <span style={{ fontSize: 15 }}>→</span>
          </span>
        </div>
      </div>
    </button>
  );
}

export default OccasionCard;

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */

function surfaceStyle(soon: boolean): CSSProperties {
  return {
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    padding: "20px 22px",
    borderRadius: 20,
    background: `linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 14%, var(--tg-sec)) 0%, var(--tg-sec) 60%)`,
    boxShadow: soon
      ? `0 6px 22px color-mix(in srgb, var(--tg-warm) 14%, transparent), 0 1px 0 color-mix(in srgb, #ffffff 4%, transparent) inset`
      : `0 6px 22px color-mix(in srgb, var(--tg-warm) 8%, transparent), 0 1px 0 color-mix(in srgb, #ffffff 4%, transparent) inset`,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    color: "var(--tg-text)",
    overflow: "hidden",
  };
}

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 6,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const dotStyle = (soon = false): CSSProperties => ({
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--tg-warm)",
  boxShadow: soon
    ? "0 0 0 6px color-mix(in srgb, var(--tg-warm) 28%, transparent)"
    : "0 0 0 4px color-mix(in srgb, var(--tg-warm) 22%, transparent)",
  animation: soon ? "occasion-pulse 1.6s ease-in-out infinite" : undefined,
});

const headerLabelStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--tg-hint)",
  fontWeight: 600,
};

const soonPillStyle: CSSProperties = {
  fontSize: 11,
  padding: "3px 9px",
  borderRadius: 999,
  background: "color-mix(in srgb, var(--tg-warm) 18%, transparent)",
  color: "var(--tg-warm)",
  fontWeight: 600,
};

const numeralRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 14,
  marginTop: 4,
};

const numeralBlockStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
};

const numeralStyle: CSSProperties = {
  fontSize: 84,
  lineHeight: 0.95,
  fontWeight: 700,
  letterSpacing: "-0.04em",
  color: "var(--tg-text)",
  fontVariantNumeric: "tabular-nums",
};

const numeralMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  paddingBottom: 10,
};

const metaLineStyle: CSSProperties = {
  fontSize: 15,
  color: "var(--tg-hint)",
  fontWeight: 500,
  lineHeight: 1.2,
};

const stampStyle: CSSProperties = {
  position: "relative",
  width: 72,
  height: 72,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  background: "color-mix(in srgb, var(--tg-warm) 16%, var(--tg-sec))",
  border: "1.5px dashed color-mix(in srgb, var(--tg-warm) 45%, transparent)",
  flexShrink: 0,
};

const stampEmojiStyle: CSSProperties = {
  fontSize: 38,
  lineHeight: 1,
  transform: "rotate(-8deg)",
  display: "inline-block",
};

const footerRowStyle: CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid color-mix(in srgb, #ffffff 6%, transparent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const footerLabelStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "var(--tg-text)",
};

const footerCtaStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--tg-warm)",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: 4,
};