import { COPY } from "../copy";
import type { MoodValue } from "../types";

interface MoodPickerProps {
  value?: MoodValue | null;
  onPick: (mood: MoodValue) => void;
  disabled?: boolean;
}

/** Mood selector — 1:1 with the gallery `.emoji-grid` / `.emoji-opt`. */
export function MoodPicker({ value, onPick, disabled }: MoodPickerProps) {
  return (
    <div className="emoji-grid">
      {COPY.mood.moods.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(m.value as MoodValue)}
            aria-pressed={active}
            className={`emoji-opt ${active ? "active" : ""}`}
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
