/**
 * GiftsCard — home-feed preview for the Gifts screen.
 *
 * Reproduces the approved gallery design: a wrapped gift-box centerpiece
 * (ribbon + bow), sender avatar + status pill at the top, and a bottom row
 * with counts + warm CTA.
 *
 * Two visual states:
 *  - waiting  : warmest treatment — pulsing "Ждёт" pill + CTA "Принять".
 *  - default  : calmer box, "N в пути · M добрых дел" meta line.
 *  - empty    : no waiting AND both counts zero → empty CTA "Подарите доброе дело →".
 *
 * All gallery shorthand tokens map to the app's --tg-* tokens so the card
 * auto-themes via prefers-color-scheme (light/dark) without hardcoded hex.
 */
import { COPY } from "../../copy";
import type { GiftItem } from "../../types";

interface GiftsCardProps {
  /** Gift currently awaiting the recipient (direction: "them", status: "received"). */
  waiting: GiftItem | null;
  /** Gifts not yet declined/archived (active in the catalog). */
  activeCount: number;
  /** Gifts marked "complete" — completed good deeds. */
  goodDeeds: number;
  onClick: () => void;
}

/** Card-local strings (do NOT edit copy.ts). */
const STR: Record<string, string> = {
  waitingBadge: "Ждёт",
  waitingSender: "Партнёр прислал",
  waitingAgo: "только что",
  giftSticker: "Жест",
  ctaAccept: "Принять",
  ctaOpen: "Открыть",
  ctaGift: "Подарить",
  metaActive: "активных",
  metaDeeds: "дел",
  emptyHint: "тёплый жест без повода",
};

const resetBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  textAlign: "left",
  width: "100%",
  cursor: "pointer",
  color: "inherit",
};

export function GiftsCard({ waiting, activeCount, goodDeeds, onClick }: GiftsCardProps) {
  const isWaiting = waiting !== null;
  const isEmpty = !isWaiting && activeCount === 0 && goodDeeds === 0;

  // Pick the gesture label: waiting gift → that one; otherwise null (calm state).
  const gestureLabel = waiting?.gesture ?? "";
  const metaText = isWaiting
    ? COPY.home.giftsWaitingMeta
    : isEmpty
      ? COPY.home.giftsEmpty
      : COPY.home.giftsMeta(activeCount, goodDeeds);

  const ariaLabel = isWaiting
    ? `${STR.ctaAccept}: ${gestureLabel}`
    : isEmpty
      ? STR.ctaGift
      : `${STR.ctaOpen}: ${activeCount} ${STR.metaActive}, ${goodDeeds} ${STR.metaDeeds}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        ...resetBtn,
        position: "relative",
        width: "100%",
        borderRadius: 22,
        padding: "18px 18px 16px",
        background:
          "linear-gradient(160deg, var(--tg-sec) 0%, color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec)) 100%)",
        boxShadow:
          "0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 color-mix(in srgb, var(--tg-warm) 14%, transparent)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
        color: "var(--tg-text)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* glow behind box */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -30,
          top: -30,
          width: 170,
          height: 170,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--tg-warm) 32%, transparent), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* top row: sender + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              position: "relative",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, #ffd29a, var(--tg-warm))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              boxShadow: "0 2px 6px rgba(0,0,0,.4)",
            }}
          >
            <span aria-hidden>А</span>
            <div
              aria-hidden
              style={{
                position: "absolute",
                right: -2,
                bottom: -2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#34c759",
                border: "2px solid var(--tg-sec)",
              }}
            />
          </div>
          <div style={{ fontSize: 13, color: "var(--tg-hint)", lineHeight: 1.1 }}>
            <div style={{ color: "var(--tg-text)", fontWeight: 600 }}>
              {STR.waitingSender}
            </div>
            <div>{STR.waitingAgo}</div>
          </div>
        </div>
        {isWaiting ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 999,
              background:
                "color-mix(in srgb, var(--tg-warm) 22%, var(--tg-sec))",
              border: "1px solid color-mix(in srgb, var(--tg-warm) 45%, transparent)",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--tg-warm)",
                boxShadow: "0 0 8px var(--tg-warm)",
                animation: "pulse 1.4s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--tg-warm)",
                letterSpacing: "0.3px",
                textTransform: "uppercase",
              }}
            >
              {STR.waitingBadge}
            </span>
          </div>
        ) : (
          <div style={{ width: 10, height: 10 }} aria-hidden />
        )}
      </div>

      {/* THE BOX */}
      <div
        style={{
          position: "relative",
          height: 118,
          borderRadius: 16,
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--tg-warm) 14%, var(--tg-sec)) 0%, color-mix(in srgb, var(--tg-warm) 6%, var(--tg-sec)) 100%)",
          border: "1px solid color-mix(in srgb, var(--tg-warm) 25%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
          overflow: "hidden",
        }}
      >
        {/* vertical ribbon */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 14,
            transform: "translateX(-50%)",
            background:
              "linear-gradient(180deg, var(--tg-warm), color-mix(in srgb, var(--tg-warm) 60%, #ffb3a6))",
          }}
        />
        {/* horizontal ribbon */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 14,
            transform: "translateY(-50%)",
            background:
              "linear-gradient(90deg, var(--tg-warm), color-mix(in srgb, var(--tg-warm) 60%, #ffb3a6))",
          }}
        />
        {/* bow */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            width: 46,
            height: 30,
            display: "flex",
            gap: 4,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 18,
              height: 22,
              borderRadius: "50% 50% 0 50%",
              background:
                "radial-gradient(circle at 30% 30%, #ffb3a6, var(--tg-warm))",
              transform: "rotate(-25deg)",
            }}
          />
          <div
            style={{
              width: 18,
              height: 22,
              borderRadius: "50% 50% 50% 0",
              background:
                "radial-gradient(circle at 70% 30%, #ffb3a6, var(--tg-warm))",
              transform: "rotate(25deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 12,
              height: 12,
              borderRadius: "50%",
              background:
                "color-mix(in srgb, var(--tg-warm) 80%, #fff)",
              boxShadow: "0 1px 3px rgba(0,0,0,.4)",
            }}
          />
        </div>

        {/* gift label sticker */}
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 12,
            padding: "4px 9px",
            borderRadius: 8,
            background: "rgba(0,0,0,.35)",
            backdropFilter: "blur(6px)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "#fff",
          }}
        >
          {STR.giftSticker}
        </div>

        {/* floating hearts */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: 14,
            bottom: 10,
            fontSize: 14,
            opacity: 0.7,
          }}
        >
          💗
        </div>
      </div>

      {/* gesture name (only when there's a gift to describe) */}
      {isWaiting ? (
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 6,
            letterSpacing: "-0.2px",
            color: "var(--tg-text)",
          }}
        >
          {gestureLabel}
        </div>
      ) : null}

      {/* meta + CTA row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "var(--tg-hint)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {!isEmpty ? (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13 }} aria-hidden>
                  🎁
                </span>
                <span>
                  {activeCount} {STR.metaActive}
                </span>
              </span>
              <span style={{ opacity: 0.4 }} aria-hidden>
                •
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13 }} aria-hidden>
                  ✨
                </span>
                <span>
                  {goodDeeds} {STR.metaDeeds}
                </span>
              </span>
            </>
          ) : (
            <span style={{ color: "var(--tg-hint)" }}>{STR.emptyHint}</span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 13px",
            borderRadius: 999,
            background: isWaiting ? "var(--tg-warm)" : "var(--tg-sec)",
            color: isWaiting ? "var(--warm-on)" : "var(--tg-button)",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: isWaiting
              ? "0 4px 12px color-mix(in srgb, var(--tg-warm) 40%, transparent)"
              : "none",
            border: isWaiting
              ? "none"
              : "1px solid color-mix(in srgb, var(--tg-button) 30%, transparent)",
          }}
        >
          {isWaiting ? STR.ctaAccept : isEmpty ? STR.ctaGift : STR.ctaOpen}
          <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>
            →
          </span>
        </div>
      </div>

      {/* meta line under CTA (the giftWaitingMeta / giftsMeta / giftsEmpty cue). */}
      <div
        style={{
          fontSize: 12,
          color: isWaiting ? "var(--tg-warm)" : "var(--tg-button)",
          fontWeight: 600,
          marginTop: 8,
        }}
      >
        {metaText}
      </div>
    </button>
  );
}
