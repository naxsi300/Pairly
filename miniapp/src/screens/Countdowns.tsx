import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type Countdown } from "../types";
import { countdownDisplay, countdownEmoji } from "../lib/format";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { TextInput } from "../components/Field";

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
      const item = await endpoints.addCountdown({
        label: label.trim(),
        targetDate: target,
        emoji: emoji.trim() || null,
      });
      setData((prev) => [item, ...(prev ?? [])]);
      setAdding(false);
      setLabel("");
      setDate("");
      setEmoji("");
      haptic("success");
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
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-tg-text">{COPY.countdowns.heading}</h1>
        <Button onClick={() => setAdding(true)} disabled={atLimit}>
          + {COPY.common.add}
        </Button>
      </header>

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
          {items.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-tg-text">
                      {countdownEmoji(c)} {c.label}
                    </p>
                    {c.recurrence ? (
                      <p className="mt-0.5 text-xs text-tg-hint">
                        {c.recurrence === "annual" ? "каждый год" : "каждый месяц"}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-medium text-tg-link">
                    {countdownDisplay(c)}
                  </span>
                </div>
                <div className="mt-3">
                  <Button variant="danger" onClick={() => remove(c)}>
                    🗑 {COPY.common.delete}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
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
