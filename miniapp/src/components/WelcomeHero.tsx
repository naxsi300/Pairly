import { COPY } from "../copy";

interface WelcomeHeroProps {
  onGift: () => void;
  onForward: () => void;
  onNote: () => void;
  onDismiss: () => void;
}

/** R-warm welcome card shown to brand-new pairs whose Home is otherwise all
 *  empty (no bucket dreams, no wishlist items, no love notes). Three guided
 *  CTAs turn first-run into "one tap and you've started", plus a small
 *  dismiss button so the user can put it away without acting. */
export function WelcomeHero({ onGift, onForward, onNote, onDismiss }: WelcomeHeroProps) {
  return (
    <section
      aria-label="Добро пожаловать"
      style={{
        position: "relative",
        padding: "20px 18px 18px",
        borderRadius: 20,
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--tg-accent) 12%, var(--tg-bg)), var(--tg-bg))",
        border:
          "1px solid color-mix(in srgb, var(--tg-accent) 25%, transparent)",
        boxShadow: "0 4px 18px color-mix(in srgb, var(--tg-accent) 10%, transparent)",
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Свернуть приветствие"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 28,
          height: 28,
          borderRadius: 14,
          border: "none",
          background: "transparent",
          color: "var(--tg-hint)",
          fontSize: 16,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>

      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--tg-text)",
          letterSpacing: -0.2,
        }}
      >
        {COPY.home.welcomeTitle}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 14,
          color: "var(--tg-hint)",
          lineHeight: 1.35,
        }}
      >
        {COPY.home.welcomeSub}
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          className="btn-warm"
          onClick={onGift}
          data-testid="welcome-cta-gift"
        >
          {COPY.home.welcomeGift}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onForward}
          data-testid="welcome-cta-forward"
        >
          {COPY.home.welcomeForward}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onNote}
          data-testid="welcome-cta-note"
        >
          {COPY.home.welcomeNote}
        </button>
      </div>
    </section>
  );
}