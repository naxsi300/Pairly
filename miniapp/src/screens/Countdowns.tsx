import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type Countdown } from "../types";
import { countdownDays, countdownDisplay, countdownEmoji, nextMilestone, nextOccurrence } from "../lib/format";
import { emitMilestone } from "../lib/milestoneBus";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { TextInput } from "../components/Field";

/** Split a countdown into day/hour/min blocks for the gallery `.countdown` layout.
 * Recurring countdowns roll forward to their next occurrence. Returns null when
 * the (effective) target has passed (caller falls back to countdownDisplay). */
function cdBlocks(c: Countdown, now: Date = new Date()): { num: string; label: string }[] | null {
  const target = (nextOccurrence(c, now) ?? new Date(c.targetDate)).getTime();
  const diff = target - now.getTime();
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
  // IMPORTANT: when the user types a bare date like "25.12.2026", we want it to
  // mean the user's LOCAL midnight on that day — not UTC midnight. ECMA-262
  // treats "YYYY-MM-DD" as UTC, so for non-UTC users this would silently
  // shift the countdown to the previous (or next) day. Append "T00:00:00" so
  // Date parses it as local time.
  const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/);
  let iso: string;
  if (m) {
    const tail = m[4] ?? "";
    // Date-only form (no time fragment) → local midnight. With a time fragment
    // (e.g. "25.12.2026 14:00") the existing "T…" interpolation handles it.
    iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}${tail || "T00:00:00"}`;
  } else {
    iso = trimmed;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Inverse of parseRuDate for prefilling the edit field: ISO → "dd.mm.yyyy". */
function isoToRuDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function Countdowns() {
  const { data, loading, error, refetch, setData } = useApi(endpoints.listCountdowns);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  const [dateErr, setDateErr] = useState(false);
  const [milestone, setMilestone] = useState(false);

  const items = data ?? [];
  const atLimit = items.length >= DEFAULT_LIMITS.countdown;
  const isEditing = editingId !== null;

  /** Clear all modal fields — on close/cancel AND after a successful save —
   * so the next open starts fresh (no stale milestone toggle, title, or date error). */
  function resetForm() {
    setLabel("");
    setDate("");
    setEmoji("");
    setMilestone(false);
    setDateErr(false);
    setEditingId(null);
  }
  const closeModal = () => {
    resetForm();
    setAdding(false);
  };

  /** Open the modal prefilled from an existing countdown (edit mode). */
  function openEdit(c: Countdown) {
    setEditingId(c.id);
    setLabel(c.label);
    setDate(isoToRuDate(c.targetDate));
    setEmoji(c.emoji ?? "");
    setMilestone(c.recurrence === "milestone");
    setDateErr(false);
  }

  /** Cap the emoji field at 4 grapheme clusters using Intl.Segmenter.
   * We can't use maxLength (it counts UTF-16 code units) — a family emoji
   * (👨‍👩‍👧‍👦) is 1 grapheme but breaks under that, and a single grapheme with
   * skin-tone modifiers would be counted as 2. */
  const EMOJI_MAX_GRAPHEMES = 4;
  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  const capEmoji = (value: string): string => {
    if (!segmenter) return value;
    const segs = Array.from(segmenter.segment(value), (s) => s.segment);
    return segs.length > EMOJI_MAX_GRAPHEMES ? segs.slice(0, EMOJI_MAX_GRAPHEMES).join("") : value;
  };

  async function submit() {
    // Synchronous busy guard: drop rapid second submits (Enter key, double-click
    // before re-render, or programmatic requestSubmit) before we start a duplicate
    // request. The button's `disabled` attribute is the user-facing safety net,
    // but it doesn't cover Enter-on-input or programmatic submits — this guard does.
    if (busy) return;
    if (!label.trim()) return;
    const target = parseRuDate(date);
    if (!target) {
      setDateErr(true);
      return;
    }
    setDateErr(false);
    setBusy(true);
    const body = {
      label: label.trim(),
      targetDate: target,
      emoji: emoji.trim() || null,
      recurrence: milestone ? "milestone" : null,
    } as const;
    try {
      if (editingId) {
        const item = await endpoints.updateCountdown(editingId, body);
        setData((prev) => (prev ?? []).map((c) => (c.id === editingId ? item : c)));
        haptic("success");
      } else {
        const item = (await endpoints.addCountdown({
          label: body.label,
          targetDate: body.targetDate,
          emoji: body.emoji,
          recurrence: body.recurrence === "milestone" ? "milestone" : undefined,
        })) as Countdown & { newMilestones?: { kind: string; value: number }[] };
        setData((prev) => [item, ...(prev ?? [])]);
        haptic("success");
        for (const m of item.newMilestones ?? []) {
          emitMilestone({ kind: m.kind, value: m.value });
        }
      }
      closeModal();
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
            const isMilestone = c.recurrence === "milestone";
            const blocks = cdBlocks(c);
            const ms = isMilestone ? nextMilestone(c) : null;
            return (
              <li key={c.id}>
                <div className="card" style={{ alignItems: "center", textAlign: "center" }}>
                  <div className="card-title">{countdownEmoji(c)} {c.label}</div>
                  {isMilestone ? (
                    <div className="card-sub">{Math.max(0, Math.abs(countdownDays(c)))} дней вместе</div>
                  ) : c.recurrence ? (
                    <div className="card-sub">{c.recurrence === "annual" ? "каждый год" : "каждый месяц"}</div>
                  ) : null}
                  {isMilestone && ms ? (
                    <>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--tg-warm)", marginTop: 4 }}>{ms.label}</div>
                      <div className="card-sub" style={{ marginTop: 2 }}>следующая круглая дата · через {ms.daysUntil} дн.</div>
                    </>
                  ) : blocks ? (
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
                  <div className="card-actions" style={{ justifyContent: "center", marginTop: 6 }}>
                    <button type="button" className="card-act ghost" onClick={() => openEdit(c)}>
                      ✏️ {COPY.common.edit}
                    </button>
                    <button type="button" className="card-act danger" aria-label={COPY.common.delete} onClick={() => remove(c)}>
                      🗑 {COPY.common.delete}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={adding || isEditing}
        title={isEditing ? "Изменить отсчёт" : COPY.countdowns.addPrompt}
        onClose={closeModal}
        onSubmit={submit}
        submitLabel={isEditing ? COPY.common.save : undefined}
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
          onChange={(e) => setEmoji(capEmoji(e.target.value))}
        />
        <button
          type="button"
          onClick={() => setMilestone((v) => !v)}
          aria-pressed={milestone}
          className="ripple-container rounded-full px-3 py-2 text-left text-sm transition"
          style={{
            background: milestone ? "var(--m3-primary-container)" : "var(--m3-surface-container)",
            color: milestone ? "var(--m3-on-primary-container)" : "var(--tg-text)",
          }}
        >
          {milestone ? "✓ " : ""}🎯 Считать круглые даты от этой даты (точка отсчёта)
        </button>
        {milestone ? (
          <p className="text-xs" style={{ color: "var(--tg-hint)" }}>
            Например, укажите дату знакомства — и ближайший повод сам покажет круглую дату: 100 дней, 1 год, 1000 дней вместе.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
