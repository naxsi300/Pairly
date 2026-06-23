import type { CSSProperties } from "react";
import { COPY } from "../../copy";
import type { MoodResponse } from "../../sdk/api";

/**
 * MoodCard — the chosen "Two glowing mood orbs" design for the home feed.
 * Reproduces the approved visual: two equal-weight circular mood orbs
 * (self + partner) with a dotted harmony arc and a "сейчас" live pulse.
 *
 * Token map (gallery -> app):
 *   --bg    -> var(--tg-bg)
 *   --sec   -> var(--tg-sec)
 *   --warm  -> var(--tg-warm)
 *   --text  -> var(--tg-text)
 *   --hint  -> var(--tg-hint)
 *   --button-> var(--tg-button)
 */

export interface MoodCardProps {
  mood: MoodResponse | null | undefined;
  onClick: () => void;
}

// Card-local copy. The controller will fold these into COPY.home later.
const STR = {
  headerLabel: "Настроение пары",
  livePill: "сейчас",
  harmony: "в резонансе",
  footerPrompt: "обновить своё настроение",
  tap: "тап",
  a11yWithPartner: (youLabel: string, partnerLabel: string) =>
    `Настроение пары: ты — ${youLabel}, ${partnerLabel}. Открыть.`,
  a11yEmpty: "Настроение пары. Открыть.",
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

/**
 * Resolve the emoji + Russian label for a given mood value.
 * Falls back to a muted placeholder if the mood is missing or unknown.
 */
function resolveMood(
  mood: { mood: string } | null | undefined,
): { emoji: string; label: string; missing: boolean } {
  if (!mood) {
    return { emoji: "•", label: COPY.mood.notSet, missing: true };
  }
  const found = COPY.mood.moods.find((m) => m.value === mood.mood);
  if (!found) {
    return { emoji: "•", label: COPY.mood.notSet, missing: true };
  }
  return { emoji: found.emoji, label: found.label, missing: false };
}

export function MoodCard({ mood, onClick }: MoodCardProps) {
  const selfMood = mood?.self ?? null;
  const partnerMood = mood?.partner ?? null;
  const partnerName = mood?.partnerName || COPY.mood.partnerLabel;

  const self = resolveMood(selfMood);
  const partner = resolveMood(partnerMood);

  const a11y =
    !self.missing && !partner.missing
      ? STR.a11yWithPartner(self.label, partnerName)
      : STR.a11yEmpty;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={a11y}
      style={buttonReset}
    >
      <div style={surfaceStyle}>
        {/* top row: title + live dot */}
        <div style={headerRowStyle}>
          <div style={headerPillStyle}>
            <span style={headerLabelStyle}>{STR.headerLabel}</span>
          </div>
          <div style={livePillStyle}>
            <span style={liveDotStyle} />
            <span style={liveLabelStyle}>{STR.livePill}</span>
          </div>
        </div>

        {/* the two orbs */}
        <div style={orbsRowStyle}>
          {/* YOU orb */}
          <div style={orbColStyle}>
            <div style={self.missing ? orbStyleMissing : orbStyleSelf}>
              <span style={orbHighlightStyle(self.missing ? 0.14 : 0.18)} />
              <span style={orbEmojiStyle}>{self.emoji}</span>
            </div>
            <div style={orbTextStyle}>
              <div style={orbNameStyle}>{COPY.mood.youLabel}</div>
              <div
                style={
                  self.missing
                    ? orbLabelMutedStyle
                    : orbLabelStyle
                }
              >
                {self.label}
              </div>
            </div>
          </div>

          {/* the harmony connector */}
          <div style={connectorStyle}>
            <svg
              width="44"
              height="22"
              viewBox="0 0 44 22"
              fill="none"
              style={svgStyle}
              aria-hidden="true"
            >
              <path
                d="M2 14 Q22 -2 42 14"
                stroke="var(--tg-warm)"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeDasharray="2 3"
                opacity={0.85}
              />
              <circle cx={22} cy={6} r={2.2} fill="var(--tg-warm)" />
            </svg>
            <div style={harmonyLabelStyle}>{STR.harmony}</div>
          </div>

          {/* PARTNER orb */}
          <div style={orbColStyle}>
            <div style={partner.missing ? orbStylePartnerMissing : orbStylePartner}>
              <span style={orbHighlightStyle(partner.missing ? 0.14 : 0.18)} />
              <span style={orbEmojiStyle}>{partner.emoji}</span>
              {/* small status badge — like the design shows on partner's orb */}
              <span style={partnerBadgeStyle}>
                <span style={partnerBadgeDotStyle} />
              </span>
            </div>
            <div style={orbTextStyle}>
              <div style={orbNameStyle}>{partnerName}</div>
              <div
                style={
                  partner.missing
                    ? orbLabelMutedStyle
                    : orbLabelStyle
                }
              >
                {partner.label}
              </div>
            </div>
          </div>
        </div>

        {/* footer cta */}
        <div style={footerRowStyle}>
          <span style={footerLabelStyle}>{STR.footerPrompt}</span>
          <div style={footerCtaStyle}>
            <span style={footerCtaTextStyle}>{STR.tap}</span>
            <span style={footerArrowStyle}>→</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default MoodCard;

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */

const surfaceStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  padding: "18px 18px 16px",
  borderRadius: 20,
  background:
    "linear-gradient(160deg, color-mix(in srgb, var(--tg-warm) 10%, var(--tg-sec)) 0%, var(--tg-sec) 60%)",
  boxShadow:
    "0 8px 24px color-mix(in srgb, #000 35%, transparent), inset 0 1px 0 color-mix(in srgb, var(--tg-warm) 8%, transparent)",
  boxSizing: "border-box",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  color: "var(--tg-text)",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 14,
};

const headerPillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const headerLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--tg-hint)",
};

const livePillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 9px",
  borderRadius: 999,
  background: "color-mix(in srgb, var(--tg-warm) 14%, var(--tg-sec))",
};

const liveDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--tg-warm)",
  boxShadow: "0 0 8px var(--tg-warm)",
  display: "inline-block",
};

const liveLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--tg-warm)",
};

const orbsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const orbColStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
};

const orbBaseStyle: CSSProperties = {
  position: "relative",
  width: 86,
  height: 86,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const orbStyleSelf: CSSProperties = {
  ...orbBaseStyle,
  background:
    "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--tg-warm) 28%, var(--tg-sec)) 0%, color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec)) 55%, var(--tg-sec) 100%)",
  boxShadow:
    "inset 0 0 0 1px color-mix(in srgb, var(--tg-warm) 22%, transparent), 0 6px 18px color-mix(in srgb, var(--tg-warm) 18%, transparent)",
};

const orbStylePartner: CSSProperties = {
  ...orbBaseStyle,
  background:
    "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--tg-warm) 22%, var(--tg-sec)) 0%, color-mix(in srgb, var(--tg-warm) 6%, var(--tg-sec)) 55%, var(--tg-sec) 100%)",
  boxShadow:
    "inset 0 0 0 1px color-mix(in srgb, var(--tg-warm) 18%, transparent), 0 6px 18px color-mix(in srgb, #000 40%, transparent)",
};

const orbStyleMissing: CSSProperties = {
  ...orbBaseStyle,
  background:
    "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec)) 0%, color-mix(in srgb, var(--tg-warm) 2%, var(--tg-sec)) 55%, var(--tg-sec) 100%)",
  boxShadow:
    "inset 0 0 0 1px color-mix(in srgb, var(--tg-hint) 22%, transparent), 0 6px 18px color-mix(in srgb, #000 25%, transparent)",
  opacity: 0.7,
};

const orbStylePartnerMissing: CSSProperties = {
  ...orbStyleMissing,
  boxShadow:
    "inset 0 0 0 1px color-mix(in srgb, var(--tg-hint) 18%, transparent), 0 6px 18px color-mix(in srgb, #000 30%, transparent)",
};

const orbHighlightStyle = (opacity: number): CSSProperties => ({
  position: "absolute",
  top: 8,
  left: "50%",
  transform: "translateX(-50%)",
  width: 32,
  height: 6,
  borderRadius: "50%",
  background: `color-mix(in srgb, #ffffff ${Math.round(opacity * 100)}%, transparent)`,
  filter: "blur(2px)",
});

const orbEmojiStyle: CSSProperties = {
  fontSize: 40,
  lineHeight: 1,
};

const orbTextStyle: CSSProperties = {
  textAlign: "center",
};

const orbNameStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--tg-hint)",
  letterSpacing: "0.04em",
};

const orbLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--tg-text)",
  marginTop: 1,
};

const orbLabelMutedStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--tg-hint)",
  marginTop: 1,
};

const partnerBadgeStyle: CSSProperties = {
  position: "absolute",
  bottom: -4,
  right: -4,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "var(--tg-sec)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1.5px solid var(--tg-warm)",
};

const partnerBadgeDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--tg-warm)",
};

const connectorStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  paddingBottom: 22,
};

const svgStyle: CSSProperties = {
  display: "block",
};

const harmonyLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--tg-warm)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const footerRowStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderRadius: 14,
  background: "color-mix(in srgb, var(--tg-warm) 10%, var(--tg-sec))",
};

const footerLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--tg-text)",
};

const footerCtaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "var(--tg-warm)",
};

const footerCtaTextStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const footerArrowStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1,
};
