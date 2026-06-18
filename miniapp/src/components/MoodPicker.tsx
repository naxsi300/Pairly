import { COPY } from "../copy";
import type { MoodValue } from "../types";

interface MoodPickerProps {
  value?: MoodValue | null;
  onPick: (mood: MoodValue) => void;
  disabled?: boolean;
}

/** 5-button mood selector. M3 chip style. */
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
            className="ripple-container flex flex-col items-center gap-1 rounded-full py-3 text-center transition active:scale-95 disabled:opacity-50"
            style={{
              background: active
                ? "var(--m3-primary-container)"
                : "var(--m3-surface-container)",
              color: active
                ? "var(--m3-on-primary-container)"
                : "var(--m3-on-surface)",
            }}
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
