interface EmptyStateProps {
  emoji?: string;
  text: string;
  hint?: string;
  /** Optional one-tap seed button — full-width .btn-warm below the hint.
   *  Lets empty lists offer "Добавить первую хотелку" instead of just text. */
  action?: { label: string; onClick: () => void };
}

/** R-warm empty state — gallery's `.empty` (centered, faded emoji + title + desc).
 *  Optionally shows a full-width warm CTA below the hint. */
export function EmptyState({ emoji = "✨", text, hint, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="emoji" aria-hidden>
        {emoji}
      </span>
      <div className="title">{text}</div>
      {hint ? <div className="desc">{hint}</div> : null}
      {action ? (
        <button
          type="button"
          className="btn-warm"
          style={{ marginTop: 16 }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
