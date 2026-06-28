import { COPY } from "../copy";
import type { MoodValue } from "../types";

interface MoodPickerProps {
  value?: MoodValue | null;
  onPick: (mood: MoodValue) => void;
  disabled?: boolean;
  /** id of the element labelling this group (e.g. the prompt heading). */
  labelledBy?: string;
}

/** Mood selector — 1:1 with the gallery `.emoji-grid` / `.emoji-opt`. The
 *  container is a `role="radiogroup"` so screen-readers announce it as a
 *  single selectable choice; each option uses `role="radio"` + `aria-checked`
 *  (replacing the older `aria-pressed` toggle semantics). */
export function MoodPicker({ value, onPick, disabled, labelledBy }: MoodPickerProps) {
  return (
    <div
      className="emoji-grid"
      role="radiogroup"
      aria-labelledby={labelledBy}
    >
      {COPY.mood.moods.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(m.value as MoodValue)}
            role="radio"
            aria-checked={active}
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
