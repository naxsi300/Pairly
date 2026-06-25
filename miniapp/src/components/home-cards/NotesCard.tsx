
export interface NotesCardProps {
  unread: number;
  latestDaysAgo: number | null;
  onClick: () => void;
}

/**
 * Card-local strings. The controller consolidates them into copy.ts later.
 * Privacy: never render any note body text here — only meta + count.
 */
const STR = {
  // "Записки для тебя" — header label echoing the chosen design's headline.
  // Kept slightly different from COPY.home.cardNotesTitle ("Записки") so the
  // home feed header still reads as a personal envelope, not a settings tab.
  headerLabel: "Записки для тебя",
  // "X непрочитанных" — count phrase, Russian genitive plural.
  unreadPhrase: (n: number) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word =
      mod10 === 1 && mod100 !== 11
        ? "непрочитанная"
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? "непрочитанные"
          : "непрочитанных";
    return `${n} ${word}`;
  },
  empty: "Напишите тёплые слова",
  // "последняя — вчера/сегодня/N дн. назад"
  latestRelative: (daysAgo: number) => {
    if (daysAgo === 0) return "последняя — сегодня";
    if (daysAgo === 1) return "последняя — вчера";
    const mod10 = daysAgo % 10;
    const mod100 = daysAgo % 100;
    const word =
      mod10 === 1 && mod100 !== 11
        ? "день"
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? "дня"
          : "дней";
    return `последняя — ${daysAgo} ${word} назад`;
  },
  // Visible a11y label for the whole envelope (privacy-safe).
  a11yLabel: (unread: number) =>
    unread > 0
      ? `Записки: ${unread} непрочитанных. Открыть.`
      : "Записки. Открыть.",
};

const RESET_BTN: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  textAlign: "left",
  width: "100%",
  cursor: "pointer",
  color: "inherit",
};

export function NotesCard({ unread, latestDaysAgo, onClick }: NotesCardProps) {
  // Display count: never show a negative number on the seal.
  const sealCount = unread > 0 ? unread : 0;
  // Hide the pulsing unread dot when there's nothing new to read.
  const showDot = unread > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={STR.a11yLabel(unread)}
      style={{
        ...RESET_BTN,
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: "18px 18px 18px 22px",
        borderRadius: "20px",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 10%, var(--tg-sec)) 0%, var(--tg-sec) 60%)",
        boxShadow:
          "0 6px 18px color-mix(in srgb, #000 35%, transparent), inset 0 1px 0 color-mix(in srgb, var(--tg-warm) 12%, transparent)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* soft warm wash blob */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "-30px",
          top: "-30px",
          width: "140px",
          height: "140px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--tg-warm) 28%, transparent) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          position: "relative",
        }}
      >
        {/* Envelope illustration */}
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: "64px",
            height: "50px",
            flexShrink: 0,
          }}
        >
          {/* envelope body */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "color-mix(in srgb, var(--tg-warm) 22%, var(--tg-sec))",
              borderRadius: "8px",
              border: "1px solid color-mix(in srgb, var(--tg-warm) 35%, transparent)",
            }}
          />
          {/* envelope flap (triangle) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "26px",
              background:
                "color-mix(in srgb, var(--tg-warm) 32%, var(--tg-sec))",
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
            }}
          />
          {/* inner darker triangle to suggest opening edge */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "26px",
              background:
                "linear-gradient(180deg, color-mix(in srgb, #000 30%, transparent) 0%, transparent 100%)",
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              opacity: 0.35,
            }}
          />
          {/* wax seal with unread count */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "-6px",
              bottom: "-6px",
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--tg-warm) 90%, #fff) 0%, var(--tg-warm) 55%, color-mix(in srgb, var(--tg-warm) 60%, #7a2a22) 100%)",
              boxShadow:
                "0 2px 6px color-mix(in srgb, #000 50%, transparent), inset 0 -2px 3px color-mix(in srgb, #000 30%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "700 13px/1 system-ui",
              color: "#3a1410",
              letterSpacing: "-0.5px",
            }}
          >
            {sealCount}
          </div>
        </div>

        {/* Text block — privacy: never include any note body text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "4px",
            }}
          >
            <span
              style={{
                font: "600 16px/1.2 system-ui",
                color: "var(--tg-text)",
                letterSpacing: "-0.2px",
              }}
            >
              {STR.headerLabel}
            </span>
            {showDot ? (
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--tg-warm)",
                  boxShadow: "0 0 8px var(--tg-warm)",
                }}
              />
            ) : null}
          </div>
          <div
            style={{
              font: "400 13px/1.35 system-ui",
              color: "var(--tg-hint)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {latestDaysAgo === null && unread === 0 ? (
              <span>{STR.empty}</span>
            ) : (
              <>
                <span>{STR.unreadPhrase(unread)}</span>
                {latestDaysAgo !== null ? (
                  <>
                    <span aria-hidden="true" style={{ opacity: 0.4 }}>
                      ·
                    </span>
                    <span>{STR.latestRelative(latestDaysAgo)}</span>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* chevron */}
        <div
          aria-hidden="true"
          style={{
            color: "var(--tg-hint)",
            font: "400 18px/1 system-ui",
            flexShrink: 0,
          }}
        >
          ›
        </div>
      </div>
    </button>
  );
}

export default NotesCard;
