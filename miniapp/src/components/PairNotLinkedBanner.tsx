import { useState } from "react";
import { COPY } from "../copy";
import { haptic } from "../sdk/twa";

/**
 * R-warm nudge shown to a user who has opened the Mini App before completing
 * `/pair` in the bot. Surfaces the literal `/pair` command and an
 * "Открыть бота" button so they have one tap to get back to the bot.
 *
 * Bot-link strategy (frontend-only, no backend changes):
 *  - If `VITE_BOT_USERNAME` is set at build time, the button opens
 *    `https://t.me/<bot>` via `Telegram.WebApp.openTelegramLink` (or
 *    `window.open` in plain-browser dev).
 *  - Otherwise, the button copies "/pair" to the clipboard and flips a
 *    short inline hint so the user has the exact command to send in the
 *    bot's chat. The banner never breaks — even without a configured bot
 *    username the user gets a usable, copy-pasteable command.
 */
export function PairNotLinkedBanner() {
  const [hint, setHint] = useState<string | null>(null);

  async function openBot() {
    haptic("light");
    const username = (import.meta.env.VITE_BOT_USERNAME as string | undefined)?.trim();
    if (username) {
      const url = `https://t.me/${username}`;
      const tg = (window as unknown as {
        Telegram?: {
          WebApp?: {
            openTelegramLink?: (u: string) => void;
            openLink?: (u: string) => void;
          };
        };
      }).Telegram?.WebApp;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
      } else if (tg?.openLink) {
        tg.openLink(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    // Fallback: copy "/pair" so the user has the exact command in their
    // clipboard when they switch to the bot. The hint is a tiny toast-like
    // confirmation that survives until the user navigates away.
    try {
      await navigator.clipboard.writeText("/pair");
      setHint("Скопировано: /pair — отправьте в боте");
    } catch {
      setHint("Откройте бота и напишите /pair");
    }
  }

  return (
    <section
      aria-label="Партнёр ещё не привязан"
      style={{
        position: "relative",
        padding: "18px 18px 16px",
        borderRadius: 20,
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--tg-accent) 10%, var(--tg-bg)), var(--tg-bg))",
        border:
          "1px solid color-mix(in srgb, var(--tg-accent) 22%, transparent)",
        boxShadow: "0 4px 18px color-mix(in srgb, var(--tg-accent) 8%, transparent)",
      }}
    >
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: "var(--tg-text)",
          letterSpacing: -0.2,
          lineHeight: 1.25,
        }}
      >
        {COPY.home.pairNotLinkedTitle}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 14,
          color: "var(--tg-hint)",
          lineHeight: 1.4,
        }}
      >
        {COPY.home.pairNotLinkedSub}
      </div>

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn-warm"
          onClick={openBot}
          data-testid="pair-not-linked-cta"
        >
          {COPY.home.pairNotLinkedCta}
        </button>
      </div>

      {hint ? (
        <div
          aria-live="polite"
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--tg-hint)",
            lineHeight: 1.35,
          }}
        >
          {hint}
        </div>
      ) : null}
    </section>
  );
}