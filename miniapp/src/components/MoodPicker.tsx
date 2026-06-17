import { COPY } from "../copy";
import type { MoodValue } from "../types";

interface MoodPickerProps {
  value?: MoodValue | null;
  onPick: (mood: MoodValue) => void;
  disabled?: boolean;
}

/** 5-button mood selector. Exactly the labels from docs/copy/mood-sync.md. */
export function MoodPicker({ value, onPick, disabled }: MoodPickerProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {COPY.mood.moods.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(m.value as MoodValue)}
            aria-pressed={active}
            className={`flex flex-col items-center gap-1 rounded-2xl py-3 text-center transition active:scale-95 disabled:opacity-50 backdrop-blur-glass-sm ${
              active
                ? "glass-button"
                : "bg-tg-secondary/60 text-tg-text"
            }`}
          >
            <span className="text-2xl" aria-hidden>
              {m.emoji}
            </span>
            <span className="text-xs">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
