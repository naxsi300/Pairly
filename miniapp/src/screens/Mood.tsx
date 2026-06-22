import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi, type MoodResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import type { MoodValue } from "../types";
import { moodIsStale } from "../lib/format";
import { MoodPicker } from "../components/MoodPicker";

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

/** Mood screen — 1:1 with the gallery: heading + pair-bar + emoji-grid + note. */
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

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <h1 className="heading">{COPY.mood.heading}</h1>
      <div className="sub">{COPY.mood.prompt}</div>

      {/* Pair mood bar — gallery .pair-bar */}
      <div className="pair-bar">
        <div className="who">
          <span className="emoji" style={{ fontSize: 24 }}>{moodEmoji(selfLive?.mood ?? null)}</span>
          <span>Вы — {selfLive?.mood ?? COPY.mood.notSet}</span>
        </div>
        <div className={partner.hint ? "who card-sub" : "who"}>
          <span className="emoji" style={{ fontSize: 24 }}>{partner.emoji}</span>
          <span>{partner.who}</span>
        </div>
      </div>

      {/* Mood picker — gallery .emoji-grid */}
      <div className="section-label">Как ты сейчас?</div>
      <MoodPicker
        value={picked ?? selfLive?.mood ?? null}
        onPick={(m) => setPicked(m)}
        disabled={busy}
      />

      {picked ? (
        <>
          <div className="section-label">{COPY.mood.notePrompt}</div>
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
