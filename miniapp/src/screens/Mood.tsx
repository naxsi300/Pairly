import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi, type MoodResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import type { MoodValue } from "../types";
import { moodIsStale } from "../lib/format";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { MoodPicker } from "../components/MoodPicker";
import { TextInput } from "../components/Field";

function MoodLine({ label, entry }: { label: string; entry: MoodResponse["self"] }) {
  if (!entry || moodIsStale(entry.setAt)) {
    return (
      <p className="text-sm text-tg-text">
        <span className="text-tg-hint">{label}: </span>
        {COPY.mood.notSet}
      </p>
    );
  }
  const emoji = COPY.mood.moods.find((m) => m.value === entry.mood)?.emoji ?? "🙂";
  return (
    <p className="text-sm text-tg-text">
      <span className="text-tg-hint">{label}: </span>
      {emoji} {entry.mood}
      {entry.note ? <span className="text-tg-hint"> — {entry.note}</span> : null}
    </p>
  );
}

export function Mood() {
  const { data, loading, error, refetch, setData } = useApi<MoodResponse>(endpoints.getMood);
  const [picked, setPicked] = useState<MoodValue | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const self = data?.self ?? null;
  // Latest-only; no history graph (privacy-by-design). Fade after 24h.
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
      // No dedicated clear endpoint in the stub; optimistic + a set to a neutral
      // value would be wrong (that's a real mood). For the mock/real split we
      // simply clear locally and let the next setMood re-establish state.
      setData((prev) => ({ ...(prev ?? ({} as MoodResponse)), self: null }));
      haptic("light");
    } catch {
      refetch();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>;
  }
  if (error) {
    return <p className="py-10 text-center text-red-500">{COPY.common.error}</p>;
  }

  const neverSet = !self;

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <h1 className="heading">{COPY.mood.heading}</h1>

      {neverSet && !picked ? (
        <EmptyState emoji="🙂" text={COPY.mood.empty} />
      ) : null}

      <Card className="mb-3">
        <p className="mb-3 text-[15px] font-medium text-tg-text">{COPY.mood.prompt}</p>
        <MoodPicker
          value={picked ?? selfLive?.mood ?? null}
          onPick={(m) => setPicked(m)}
          disabled={busy}
        />

        {picked ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-tg-hint">{COPY.mood.notePrompt}</p>
            <TextInput
              placeholder={COPY.mood.notePlaceholder}
              maxLength={60}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {COPY.common.save}
              </Button>
              <Button variant="ghost" onClick={() => setPicked(null)}>
                {COPY.common.skip}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-col gap-1.5">
          <MoodLine label={COPY.mood.youLabel} entry={data?.self ?? null} />
          <MoodLine label={COPY.mood.partnerLabel} entry={data?.partner ?? null} />
        </div>
        {selfLive ? (
          <div className="mt-3">
            <Button variant="danger" onClick={clear} disabled={busy}>
              {COPY.mood.clearButton}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
