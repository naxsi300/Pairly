interface EmptyStateProps {
  /** Emoji shown above the text. */
  emoji?: string;
  /** Main copy, already in Russian. */
  text: string;
  /** Optional smaller hint line below. */
  hint?: string;
}

/** Warm empty state. Text comes from docs/copy/ verbatim. */
export function EmptyState({ emoji = "✨", text, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-4xl" aria-hidden>
        {emoji}
      </div>
      <p className="max-w-sm text-[15px] leading-relaxed text-tg-text">{text}</p>
      {hint ? <p className="max-w-sm text-sm text-tg-hint">{hint}</p> : null}
    </div>
  );
}
