interface EmptyStateProps {
  emoji?: string;
  text: string;
  hint?: string;
}

/** R-warm empty state — gallery's `.empty` (centered, faded emoji + title + desc). */
export function EmptyState({ emoji = "✨", text, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="emoji" aria-hidden>
        {emoji}
      </span>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--tg-text)", marginBottom: 6 }}>
        {text}
      </div>
      {hint ? <div style={{ fontSize: 14 }}>{hint}</div> : null}
    </div>
  );
}
