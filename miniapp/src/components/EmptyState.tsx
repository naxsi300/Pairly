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
      <div className="title">{text}</div>
      {hint ? <div className="desc">{hint}</div> : null}
    </div>
  );
}
