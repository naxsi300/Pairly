import { useEffect, useRef, useState, type CSSProperties } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type Countdown } from "../types";
import { countdownDisplay, countdownEmoji, milestoneTitle, nextMilestone, nextOccurrence } from "../lib/format";
import { emitMilestone } from "../lib/milestoneBus";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { ScreenHeader } from "../components/ScreenHeader";
import { TextInput } from "../components/Field";

/** Split a countdown into day/hour/min blocks for the gallery `.countdown` layout.
 * Recurring countdowns roll forward to their next occurrence. Returns null when
 * the (effective) target has passed OR the remaining time is < 1 minute (so the
 * caller falls back to countdownDisplay's "сегодня!" / same-day label instead of
 * rendering a flat "0 часов 0 минут"). */
function cdBlocks(c: Countdown, now: Date = new Date()): { num: string; label: string }[] | null {
  const target = (nextOccurrence(c, now) ?? new Date(c.targetDate)).getTime();
  const diff = target - now.getTime();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d >= 1) return [{ num: String(d), label: "дней" }, { num: String(h), label: "часов" }];
  // Sub-day: collapse the "<1 min" tail to a "ну почти!" / "сегодня!" friendly
  // fallback. Returning null here routes the render to countdownDisplay(c),
  // which already produces "сегодня!" for same-day targets and "через N ч" for
  // the (hours > 0, minutes = 0) boundary. Only when ALL three are zero do we
  // bail — that's the "event is here right now" instant.
  if (h === 0 && m === 0) return null;
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

/** Surface style for an item card: warm-wash on --tg-sec. Soon items get the
 * emphasis gradient so they're visually distinct from the regular ones. */
const warmWashSurface: CSSProperties = {
  background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const warmWashSurfaceSoon: CSSProperties = {
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 16%, var(--tg-sec)), color-mix(in srgb, var(--tg-warm) 6%, var(--tg-sec)))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

/** 40px warm-tile emoji anchor — gives every row an identity at a glance. */
const emojiTile: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  flexShrink: 0,
  background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
};

/** A countdown is "soon" when its upcoming occurrence is within 7 days. We use
 * this to switch the row to the emphasis gradient — same threshold used for
 * the home-feed "next occasion" card, so a soon row reads the same in both
 * places. */
function isSoon(c: Countdown, now: Date = new Date()): boolean {
  const occ = nextOccurrence(c, now);
  const target = occ ?? new Date(c.targetDate);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return false; // past — fall back to the stat-big display
  const days = Math.floor(diff / 86_400_000);
  return days <= 7;
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
  /** Original recurrence from the countdown being edited — preserved on save so
   * the edit modal doesn't silently strip an existing "annual"/"monthly"
   * recurrence just because the milestone toggle isn't on. */
  const [originalRecurrence, setOriginalRecurrence] =
    useState<Countdown["recurrence"]>(null);
  /** Item pending deletion — set on trash-click, consumed by a confirm Modal
   * before we actually call remove(). null = no dialog open. */
  const [confirmDelete, setConfirmDelete] = useState<Countdown | null>(null);
  /** Currently selected milestone preset (or "custom" when the user wants a
   * free-form label). null = nothing picked yet. Reset to null on every modal
   * open (add + edit) so editing never resurrects the previous preset. */
  const [presetId, setPresetId] = useState<string | null>(null);

  const items = data ?? [];
  const atLimit = items.length >= DEFAULT_LIMITS.countdown;
  const isEditing = editingId !== null;

  /** Day-of milestone toast. When the Countdowns list loads and any milestone
   * countdown has reached its next round date (daysUntil === 0), fire one
   * `emitMilestone` so the App-level toast pings the user. Guarded by a ref
   * keyed on (countdown id + round value) so a re-fetch after the user has
   * already seen the toast for THIS round doesn't re-fire.
   *
   * Note: the toast's KIND_LABEL map doesn't yet know "milestone"; the toast
   * falls back to COPY.milestones.generic. Label-based copy (e.g. "100 дней
   * вместе") is a possible follow-up if Toast.tsx grows a "milestone" branch. */
  const lastEmittedMilestoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!items || items.length === 0) return;
    for (const c of items) {
      if (c.recurrence !== "milestone") continue;
      const ms = nextMilestone(c);
      if (!ms || ms.daysUntil !== 0) continue;
      const key = `${c.id}:${ms.value}:${ms.unit}`;
      if (lastEmittedMilestoneRef.current === key) continue;
      lastEmittedMilestoneRef.current = key;
      emitMilestone({ kind: "milestone", value: ms.value });
    }
  }, [items]);

  /** Clear all modal fields — on close/cancel AND after a successful save —
   * so the next open starts fresh (no stale milestone toggle, title, or date error). */
  function resetForm() {
    setLabel("");
    setDate("");
    setEmoji("");
    setMilestone(false);
    setDateErr(false);
    setEditingId(null);
    setOriginalRecurrence(null);
    setPresetId(null);
  }
  const closeModal = () => {
    resetForm();
    setAdding(false);
  };

  /** Open the modal in "add new" mode — ensures the modal opens with a clean
   * preset state (no stale preset from a prior edit session). */
  function openAdd() {
    setPresetId(null);
    setAdding(true);
  }

  /** Open the modal prefilled from an existing countdown (edit mode). */
  function openEdit(c: Countdown) {
    setEditingId(c.id);
    setLabel(c.label);
    setDate(isoToRuDate(c.targetDate));
    setEmoji(c.emoji ?? "");
    setMilestone(c.recurrence === "milestone");
    setOriginalRecurrence(c.recurrence);
    setDateErr(false);
    // Editing never re-selects a preset — the user's existing label is the truth.
    setPresetId(null);
  }

  /** Cap the emoji field at 4 grapheme clusters using Intl.Segmenter.
   * We can't use maxLength (it counts UTF-16 code units) — a family emoji
   * (👨‍👩‍👧‍👦) is 1 grapheme but breaks under that, and a single grapheme with
   * skin-tone modifiers would be counted as 2.
   *
   * Cluster 7(b): if `Intl.Segmenter` is unavailable (older runtime / test
   * sandbox), we still cap by code points so the value can never run away.
   * Grapheme correctness is best-effort; the cap is the invariant.
   */
  const EMOJI_MAX_GRAPHEMES = 4;
  // 32 code points is a defensive upper bound — far above the 4-grapheme
  // ceiling but still bounded so a paste of thousands of emoji can't blow up.
  const EMOJI_MAX_CODEPOINTS_FALLBACK = 32;
  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  const capEmoji = (value: string): string => {
    if (segmenter) {
      const segs = Array.from(segmenter.segment(value), (s) => s.segment);
      return segs.length > EMOJI_MAX_GRAPHEMES ? segs.slice(0, EMOJI_MAX_GRAPHEMES).join("") : value;
    }
    const cps = Array.from(value);
    return cps.length > EMOJI_MAX_CODEPOINTS_FALLBACK
      ? cps.slice(0, EMOJI_MAX_CODEPOINTS_FALLBACK).join("")
      : value;
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
    // When editing, preserve any pre-existing non-milestone recurrence
    // (annual/monthly) so toggling "milestone" off doesn't silently wipe it.
    // For a brand-new countdown, the only recurrence the UI can set is
    // "milestone" via the chip — annual/monthly aren't user-creatable here.
    const recurrence = milestone
      ? "milestone"
      : editingId
        ? originalRecurrence && originalRecurrence !== "milestone"
          ? originalRecurrence
          : null
        : null;
    const body = {
      label: label.trim(),
      targetDate: target,
      emoji: emoji.trim() || null,
      recurrence,
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

  /** User confirmed the delete in the second Modal — fire the actual removal. */
  function confirmRemove() {
    if (!confirmDelete) return;
    const item = confirmDelete;
    setConfirmDelete(null);
    void remove(item);
  }

  /** Apply a milestone preset chip. A relationship preset ("День знакомства",
   * "Свадьба", etc.) fills label + emoji so the user can tweak from there.
   * «Своя дата» (id "custom") only marks "no preset" — it leaves whatever
   * label the user already typed untouched. */
  function applyPreset(p: { id: string; label: string; emoji: string }) {
    if (p.id === "custom") {
      setPresetId("custom");
      return;
    }
    setPresetId(p.id);
    setLabel(p.label);
    setEmoji(p.emoji);
  }

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader
        emoji="🎂"
        title={COPY.countdowns.heading}
        action={
          <button
            type="button"
            className="btn-warm"
            style={{ width: "auto", padding: "10px 16px", fontSize: 14 }}
            onClick={openAdd}
            disabled={atLimit}
          >
            + {COPY.common.add}
          </button>
        }
      />

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
        <p className="py-10 text-center text-[var(--tg-danger)]">{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState emoji="📅" text={COPY.countdowns.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => {
            const isMilestone = c.recurrence === "milestone";
            const blocks = cdBlocks(c);
            const ms = isMilestone ? nextMilestone(c) : null;
            const soon = isSoon(c);
            return (
              <li key={c.id}>
                <div style={soon ? warmWashSurfaceSoon : warmWashSurface}>
                  <div className="flex items-center gap-3">
                    <span aria-hidden style={emojiTile}>
                      {countdownEmoji(c)}
                    </span>
                    <div className="card-title min-w-0 flex-1 truncate">{c.label}</div>
                  </div>
                  {/* Milestone rows: the next-round stat-big + "следующая круглая
                      дата" line below carry the live info, so we skip the plain
                      elapsed-days sub-line here (it duplicated the round count
                      on the day a round lands). Recurring countdowns keep their
                      "каждый год/месяц" cadence line. */}
                  {c.recurrence && c.recurrence !== "milestone" ? (
                    <div className="card-sub">{c.recurrence === "annual" ? "каждый год" : "каждый месяц"}</div>
                  ) : null}
                  {isMilestone && ms ? (
                    <>
                      <div className="stat-big mt-1" style={{ color: "var(--tg-warm)" }}>{milestoneTitle(c.label, ms.value, ms.unit === "years")}</div>
                      <div className="card-sub mt-0.5">следующая круглая дата · через {ms.daysUntil} дн.</div>
                    </>
                  ) : blocks ? (
                    <div className="countdown mt-1">
                      {blocks.map((b) => (
                        <div className="cd-unit" key={b.label}>
                          <div className="cd-num">{b.num}</div>
                          <div className="cd-label">{b.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="stat-big mt-1" style={{ color: "var(--tg-button)" }}>{countdownDisplay(c)}</div>
                  )}
                  <div className="card-actions justify-center mt-1.5">
                    <button
                      type="button"
                      className="card-act ghost"
                      aria-label={`Изменить отсчёт ${c.label}`}
                      onClick={() => openEdit(c)}
                    >
                      ✏️ {COPY.common.edit}
                    </button>
                    <button
                      type="button"
                      className="card-act danger"
                      aria-label={`Удалить отсчёт ${c.label}`}
                      onClick={() => setConfirmDelete(c)}
                    >
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
          <p className="text-xs text-[var(--tg-danger)]">Не разобрал дату. Попробуйте 25.12.2026.</p>
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
          className={`chip ripple-container ${milestone ? "active" : ""}`}
        >
          {milestone ? "✓ " : ""}🎯 Считать круглые даты от этой даты (точка отсчёта)
        </button>
        {milestone ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 6px" }}>
              {COPY.countdowns.milestonePresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  aria-pressed={presetId === p.id}
                  className={`chip ${presetId === p.id ? "active" : ""}`}
                  style={{ fontSize: 13 }}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs" style={{ color: "var(--tg-hint)" }}>
              Например, укажите любую важную дату — и ближайший повод сам покажет круглую отметку: 100 дней, 1 год, 1000 дней.
            </p>
          </>
        ) : null}
      </Modal>

      <Modal
        open={confirmDelete !== null}
        title={confirmDelete ? `Удалить отсчёт «${confirmDelete.label}»?` : ""}
        onClose={() => setConfirmDelete(null)}
        onSubmit={confirmRemove}
        submitLabel={COPY.common.delete}
        submitVariant="danger"
      >
        <p className="text-sm" style={{ color: "var(--tg-hint)" }}>
          Это действие нельзя отменить. Отсчёт исчезнет у вас обоих.
        </p>
      </Modal>
    </div>
  );
}