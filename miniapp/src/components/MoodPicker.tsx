import { COPY } from "../copy";
import type { MoodValue } from "../types";

interface MoodPickerProps {
  value?: MoodValue | null;
  onPick: (mood: MoodValue) => void;
  disabled?: boolean;
}

/** Mood selector — R-warm tiles (gallery mood-opt). 2-wide responsive wrap. */
export function MoodPicker({ value, onPick, disabled }: MoodPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {COPY.mood.moods.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(m.value as MoodValue)}
            aria-pressed={active}
            className={`rw-mood-opt ripple-container ${active ? "is-active" : ""}`}
          >
            <span className="emoji" aria-hidden>
              {m.emoji}
            </span>
            <span className="label">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
