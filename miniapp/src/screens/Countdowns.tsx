import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type Countdown } from "../types";
import { countdownDisplay, countdownEmoji } from "../lib/format";
import { emitMilestone } from "../lib/milestoneBus";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { TextInput } from "../components/Field";

/** Split a countdown into day/hour/min blocks for the gallery `.countdown` layout.
 * Returns null when the target has passed (caller falls back to countdownDisplay). */
function cdBlocks(c: Countdown, now: Date = new Date()): { num: string; label: string }[] | null {
  const diff = new Date(c.targetDate).getTime() - now.getTime();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d >= 1) return [{ num: String(d), label: "дней" }, { num: String(h), label: "часов" }];
  return [{ num: String(h), label: "часов" }, { num: String(m), label: "минут" }];
}

function parseRuDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept dd.mm.yyyy, dd.mm.yyyy HH:mm, ISO, or anything Date can parse.
  const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/);
  let iso: string;
  if (m) {
    iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}${m[4] ?? ""}`;
  } else {
    iso = trimmed;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function Countdowns() {
  const { data, loading, error, refetch, setData } = useApi(endpoints.listCountdowns);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  const [dateErr, setDateErr] = useState(false);

  const items = data ?? [];
  const atLimit = items.length >= DEFAULT_LIMITS.countdown;

  async function submit() {
    if (!label.trim()) return;
    const target = parseRuDate(date);
    if (!target) {
      setDateErr(true);
      return;
    }
    setDateErr(false);
    setBusy(true);
    try {
      const item = (await endpoints.addCountdown({
        label: label.trim(),
        targetDate: target,
        emoji: emoji.trim() || null,
      })) as Countdown & { newMilestones?: { kind: string; value: number }[] };
      setData((prev) => [item, ...(prev ?? [])]);
      setAdding(false);
      setLabel("");
      setDate("");
      setEmoji("");
      haptic("success");
      for (const m of item.newMilestones ?? []) {
        emitMilestone({ kind: m.kind, value: m.value });
      }
    } catch {
      refetch();
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Countdown) {
    setData((prev) => (prev ?? []).filter((c) => c.id !== item.id));
    haptic("light");
    try {
      await endpoints.deleteCountdown(item.id);
    } catch {
      refetch();
    }
  }

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <h1 className="heading">{COPY.countdowns.heading}</h1>
      <button type="button" className="btn-warm" onClick={() => setAdding(true)} disabled={atLimit} style={{ marginBottom: 12 }}>
        + {COPY.common.add}
      </button>

      {atLimit ? (
        <div className="mb-3">
          <LimitBanner
            text={COPY.countdowns.limitHit}
            count={items.length}
            max={DEFAULT_LIMITS.countdown}
            onUpgrade={() => alert("Pro: оплата подключается позже (USDT/СБП).")}
            onDeleteOld={() => alert("Удалите старый отсчёт.")}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>
      ) : error ? (
        <p className="py-10 text-center text-red-500">{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState emoji="📅" text={COPY.countdowns.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => {
            const blocks = cdBlocks(c);
            return (
              <li key={c.id}>
                <div className="card" style={{ alignItems: "center", textAlign: "center" }}>
                  <div className="card-title">{countdownEmoji(c)} {c.label}</div>
                  {c.recurrence ? (
                    <div className="card-sub">{c.recurrence === "annual" ? "каждый год" : "каждый месяц"}</div>
                  ) : null}
                  {blocks ? (
                    <div className="countdown" style={{ marginTop: 4 }}>
                      {blocks.map((b) => (
                        <div className="cd-unit" key={b.label}>
                          <div className="cd-num">{b.num}</div>
                          <div className="cd-label">{b.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 28, fontWeight: 700, color: "var(--tg-button)", marginTop: 4 }}>{countdownDisplay(c)}</div>
                  )}
                  <button type="button" className="btn-ghost" style={{ width: "auto", padding: "8px 16px", color: "var(--m3-error)", borderColor: "color-mix(in srgb, var(--m3-error) 30%, transparent)", marginTop: 4 }} onClick={() => remove(c)}>
                    🗑 {COPY.common.delete}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={adding}
        title={COPY.countdowns.addPrompt}
        onClose={() => setAdding(false)}
        onSubmit={submit}
        submitDisabled={!label.trim() || !date.trim() || busy}
      >
        <TextInput
          autoFocus
          placeholder={COPY.countdowns.labelPlaceholder}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <TextInput
          placeholder={COPY.countdowns.datePlaceholder}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setDateErr(false);
          }}
        />
        {dateErr ? (
          <p className="text-xs text-red-500">Не разобрал дату. Попробуйте 25.12.2026.</p>
        ) : null}
        <TextInput
          placeholder={COPY.countdowns.emojiPlaceholder}
          value={emoji}
          maxLength={4}
          onChange={(e) => setEmoji(e.target.value)}
        />
      </Modal>
    </div>
  );
}
