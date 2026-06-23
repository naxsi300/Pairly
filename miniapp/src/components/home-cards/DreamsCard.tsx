import { COPY } from "../../copy";
import type { BucketItem } from "../../types";

interface DreamsCardProps {
  dream: BucketItem | null;
  dreamingCount: number;
  doneCount: number;
  onClick: () => void;
}

/**
 * Card-local copy. The controller in copy.ts is the source of truth; until
 * these strings land there, they live here so the visual is complete.
 */
const STR: Record<string, string> = {
  // Header
  dreamsLabel: "Мечты",
  // "сейчас мечтаем:" — small caption above the floating dream title
  dreamingNow: "сейчас мечтаем:",
  // Pinned tag — shown on the floating dream pill ("оба смотрят")
  bothWatching: "оба смотрят",
  // Pinned count chip with star
  dreamingChip: "мечтаем",
  // Pinned count chip with shooting-star (done dreams)
  doneChip: "сбылось",
  // Open-invitation caption
  openCta: "Открыть →",
  // Watermark inside the jar
  jarWatermark: "сбылось",
  // "вместе" small label after the divider in the header
  togetherTag: "вместе",
};

const BUTTON_RESET: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  textAlign: "left",
  width: "100%",
  cursor: "pointer",
  color: "inherit",
};

export function DreamsCard({ dream, dreamingCount, doneCount, onClick }: DreamsCardProps) {
  const total = Math.max(1, dreamingCount + doneCount);
  // done share of the jar's liquid, clamped to [0, 1]
  const fillPct = Math.max(0, Math.min(1, doneCount / total));
  // The jar's liquid lives in the lower portion of the glass — the design's
  // sample sets it to 58% of the glass height. We scale linearly with fillPct
  // so an empty bucket is empty and a fully-fulfilled jar is full.
  const fillHeight = Math.round(58 * fillPct);
  const hasDream = !!dream;

  const a11yLabel = hasDream
    ? `${STR.dreamsLabel}: ${dream!.title}. ${COPY.home.dreamsMeta(dreamingCount, doneCount)}`
    : `${STR.dreamsLabel}. ${COPY.home.dreamsEmpty}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={a11yLabel}
      className="dreams-card"
      style={{
        ...BUTTON_RESET,
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        borderRadius: 22,
        padding: 18,
        background:
          "linear-gradient(135deg,var(--tg-sec) 0%,color-mix(in srgb,var(--tg-warm) 14%,var(--tg-sec)) 100%)",
        boxShadow:
          "0 10px 26px rgba(0,0,0,.4),inset 0 1px 0 color-mix(in srgb,var(--tg-warm) 16%,transparent)",
        fontFamily: "-apple-system,system-ui,sans-serif",
        cursor: "pointer",
        overflow: "hidden",
        display: "block",
      }}
    >
      {/* Header: title + divider + "вместе" tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--tg-warm)",
          }}
        >
          🌌 {STR.dreamsLabel}
        </span>
        <span
          style={{
            flex: 1,
            height: 1,
            background:
              "linear-gradient(90deg,color-mix(in srgb,var(--tg-warm) 30%,transparent),transparent)",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--tg-hint)" }}>{STR.togetherTag}</span>
      </div>

      {/* Body: left text column + right jar */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--tg-hint)",
                marginBottom: 6,
                letterSpacing: ".02em",
              }}
            >
              {STR.dreamingNow}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "var(--tg-text)",
                lineHeight: 1.2,
                marginBottom: 10,
                // Truncate floating dream title to one line; jar floats beside it.
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {hasDream ? dream!.title : COPY.home.dreamsEmpty}
            </div>
            {hasDream ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 9px",
                  borderRadius: 999,
                  background:
                    "color-mix(in srgb,var(--tg-warm) 20%,var(--tg-sec))",
                  border:
                    "1px solid color-mix(in srgb,var(--tg-warm) 35%,transparent)",
                }}
              >
                <span style={{ fontSize: 11 }}>👀</span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--tg-text)",
                    fontWeight: 600,
                  }}
                >
                  {STR.bothWatching}
                </span>
              </div>
            ) : null}
          </div>

          {/* Pinned counts row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 8px",
                borderRadius: 8,
                background:
                  "color-mix(in srgb,var(--tg-warm) 14%,var(--tg-sec))",
                transform: "rotate(-2deg)",
                boxShadow: "0 2px 4px rgba(0,0,0,.25)",
              }}
            >
              <span style={{ fontSize: 11 }}>⭐</span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--tg-warm)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {dreamingCount}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 8px",
                borderRadius: 8,
                // Brand-neutral green tint, themed via the same warm token family
                // so the chip adapts to light/dark.
                background:
                  "color-mix(in srgb,var(--tg-warm) 14%,var(--tg-sec))",
                transform: "rotate(2deg)",
                boxShadow: "0 2px 4px rgba(0,0,0,.25)",
                opacity: doneCount > 0 ? 1 : 0.55,
              }}
            >
              <span style={{ fontSize: 11 }}>🌠</span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--tg-warm)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {doneCount}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 11,
                color: "var(--tg-warm)",
                fontWeight: 600,
              }}
            >
              {STR.openCta}
            </span>
          </div>
        </div>

        {/* Jar column */}
        <div
          style={{
            position: "relative",
            width: 78,
            flexShrink: 0,
            alignSelf: "stretch",
          }}
        >
          {/* Jar lid */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: -6,
              transform: "translateX(-50%)",
              width: 44,
              height: 8,
              background:
                "linear-gradient(180deg,color-mix(in srgb,var(--tg-warm) 50%,#fff),color-mix(in srgb,var(--tg-warm) 30%,var(--tg-sec)))",
              borderRadius: "4px 4px 2px 2px",
              boxShadow: "0 2px 4px rgba(0,0,0,.4)",
            }}
          />

          {/* Steam/spark above the jar */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: -2,
              transform: "translateX(-50%)",
              width: 2,
              height: 6,
              background:
                "color-mix(in srgb,var(--tg-warm) 60%,transparent)",
              borderRadius: 1,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "30%",
              top: 0,
              transform: "translateX(-50%)",
              width: 6,
              height: 6,
              background: "#fff",
              borderRadius: "50%",
              boxShadow: "0 0 6px var(--tg-warm)",
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "25%",
              top: 2,
              transform: "translateX(50%)",
              width: 4,
              height: 4,
              background: "var(--tg-warm)",
              borderRadius: "50%",
              opacity: 0.7,
            }}
          />

          {/* Jar glass */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 4,
              bottom: 0,
              borderRadius: "8px 8px 18px 18px",
              background:
                "linear-gradient(180deg,color-mix(in srgb,var(--tg-warm) 8%,rgba(255,255,255,.06)) 0%,color-mix(in srgb,var(--tg-warm) 4%,rgba(255,255,255,.04)) 100%)",
              border:
                "1.5px solid color-mix(in srgb,var(--tg-warm) 35%,transparent)",
              boxShadow:
                "inset 0 0 12px color-mix(in srgb,var(--tg-warm) 18%,transparent),0 4px 10px rgba(0,0,0,.35)",
              overflow: "hidden",
            }}
          >
            {/* Liquid — height scales with done ratio so empty bucket = empty jar */}
            <div
              style={{
                position: "absolute",
                left: 6,
                right: 6,
                top: "auto",
                bottom: 0,
                height: `${fillHeight}%`,
                background:
                  "linear-gradient(180deg,color-mix(in srgb,var(--tg-warm) 35%,transparent),color-mix(in srgb,var(--tg-warm) 55%,#ff6b8a))",
                borderRadius: "0 0 16px 16px",
                transition: "height .4s ease",
              }}
            >
              {/* Meniscus highlight on top of the liquid */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: -3,
                  height: 6,
                  background:
                    "radial-gradient(ellipse at center,color-mix(in srgb,var(--tg-warm) 70%,#fff) 0%,color-mix(in srgb,var(--tg-warm) 40%,transparent) 60%,transparent 100%)",
                  filter: "blur(.5px)",
                }}
              />
            </div>

            {/* Glass highlight strip */}
            <div
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                top: "30%",
                height: 1,
                background:
                  "color-mix(in srgb,#fff 25%,transparent)",
                opacity: 0.4,
              }}
            />

            {/* Floating bubbles in the liquid */}
            <div
              style={{
                position: "absolute",
                left: "35%",
                bottom: "18%",
                width: 5,
                height: 5,
                background:
                  "color-mix(in srgb,#fff 80%,var(--tg-warm))",
                borderRadius: "50%",
                opacity: 0.7,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "55%",
                bottom: "32%",
                width: 4,
                height: 4,
                background:
                  "color-mix(in srgb,#fff 70%,var(--tg-warm))",
                borderRadius: "50%",
                opacity: 0.5,
              }}
            />
          </div>

          {/* Watermark label inside the glass */}
          <div
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: 14,
              textAlign: "center",
              fontSize: 9,
              color: "var(--tg-hint)",
              fontWeight: 600,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              pointerEvents: "none",
            }}
          >
            {STR.jarWatermark}
          </div>
        </div>
      </div>
    </button>
  );
}

export default DreamsCard;
