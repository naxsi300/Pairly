import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi, type MoodResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import type { MoodValue } from "../types";
import { moodIsStale } from "../lib/format";
import { MoodPicker } from "../components/MoodPicker";
import { ScreenHeader } from "../components/ScreenHeader";

function moodEmoji(mood: string | null | undefined): string {
  if (!mood) return "⏳";
  return COPY.mood.moods.find((m) => m.value === mood)?.emoji ?? "🙂";
}

function partnerText(d: MoodResponse | null): { who: string; emoji: string; hint: boolean } {
  if (!d) return { who: COPY.mood.notSet, emoji: "⏳", hint: true };
  if (d.partner && !moodIsStale(d.partner.setAt)) {
    return {
      who: `${d.partnerName || COPY.mood.partnerLabel} — ${d.partner.mood}`,
      emoji: moodEmoji(d.partner.mood),
      hint: false,
    };
  }
  return { who: `⏳ ${d.partnerName || "Партнёр"} ещё не отметил(а)`, emoji: "⏳", hint: true };
}

/* ------------------------------------------------------------------ */
/* styles (R-warm: warm-wash surfaces, --tg-* tokens, emoji anchors)  */
/* ------------------------------------------------------------------ */

const WARM_WASH: import("react").CSSProperties = {
  background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const WARM_WASH_STRONG: import("react").CSSProperties = {
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 16%, var(--tg-sec)), color-mix(in srgb, var(--tg-warm) 6%, var(--tg-sec)))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const EMOJI_TILE: import("react").CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
  flexShrink: 0,
};

const WHO_ROW: import("react").CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

/** Mood screen — R-warm: ScreenHeader + warm-wash pair bar (self = emphasis
 *  gradient, partner = warm wash) + warm-wash picker section + danger-tinted
 *  clear ghost button. All behavior (pick/save/clear/note/refetch/privacy)
 *  is unchanged. */
export function Mood() {
  const { data, loading, error, refetch, setData } = useApi<MoodResponse>(endpoints.getMood);
  const [picked, setPicked] = useState<MoodValue | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const self = data?.self ?? null;
  const selfLive = self && !moodIsStale(self.setAt) ? self : null;

  async function save() {
    if (!picked) return;
    setBusy(true);
    try {
      const entry = await endpoints.setMood({ mood: picked, note: note.trim() || null });
      setData((prev) => ({ ...(prev ?? ({} as MoodResponse)), self: entry }));
      setPicked(null);
      setNote("");
      haptic("success");
    } catch {
      refetch();
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      setData((prev) => ({ ...(prev ?? ({} as MoodResponse)), self: null }));
      setPicked(null);
      setNote("");
      haptic("light");
      await endpoints.clearMood();
    } catch {
      refetch();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <span className="emoji">⏳</span>
        <div className="title">{COPY.common.loading}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty-state">
        <span className="emoji">😕</span>
        <div className="title">{COPY.common.error}</div>
      </div>
    );
  }

  const partner = partnerText(data);
  const selfEmoji = moodEmoji(selfLive?.mood ?? null);

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader emoji="🙋" title={COPY.mood.heading} />

      {/* Pair mood — R-warm: self card uses emphasis gradient (you + live),
          partner card uses base warm wash (alive, present, not faded). */}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1" style={WARM_WASH_STRONG}>
          <div style={WHO_ROW}>
            <span aria-hidden style={EMOJI_TILE}>{selfEmoji}</span>
            <div className="min-w-0">
              <div className="section-label" style={{ margin: 0 }}>{COPY.mood.youLabel}</div>
              <div className="card-title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selfLive?.mood ?? COPY.mood.notSet}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1" style={WARM_WASH}>
          <div style={WHO_ROW}>
            <span aria-hidden style={EMOJI_TILE}>{partner.emoji}</span>
            <div className="min-w-0">
              <div className="section-label" style={{ margin: 0 }}>{data?.partnerName || COPY.mood.partnerLabel}</div>
              <div
                className="card-title"
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: partner.hint ? "var(--tg-hint)" : "var(--tg-text)",
                }}
              >
                {partner.who.replace(/^[^—]*—\s*/, "").trim() || COPY.mood.notSet}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Picker + note — warm-wash surface so the section reads as one card. */}
      <div className="section-label" style={{ marginTop: 18 }}>Как ты сейчас?</div>
      <div style={WARM_WASH}>
        <MoodPicker
          value={picked ?? selfLive?.mood ?? null}
          onPick={(m) => setPicked(m)}
          disabled={busy}
        />

        {picked ? (
          <>
            <div className="section-label" style={{ marginTop: 14 }}>{COPY.mood.notePrompt}</div>
            <input
              className="input"
              placeholder={COPY.mood.notePlaceholder}
              maxLength={60}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <button type="button" className="btn-warm flex-1" onClick={save} disabled={busy}>
                {COPY.common.save}
              </button>
              <button type="button" className="btn-ghost flex-1" onClick={() => { setPicked(null); setNote(""); }}>
                {COPY.common.skip}
              </button>
            </div>
          </>
        ) : null}
      </div>

      {selfLive ? (
        <button
          type="button"
          className="btn-ghost"
          style={{ marginTop: 8, color: "var(--tg-danger)", borderColor: "color-mix(in srgb, var(--tg-danger) 30%, transparent)" }}
          onClick={clear}
          disabled={busy}
        >
          {COPY.mood.clearButton}
        </button>
      ) : null}
    </div>
  );
}