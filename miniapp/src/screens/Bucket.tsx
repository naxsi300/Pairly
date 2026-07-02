import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type BucketItem } from "../types";
import { bucketStatusLabel, shortDate } from "../lib/format";
import { emitMilestone } from "../lib/milestoneBus";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { ScreenHeader } from "../components/ScreenHeader";
import { TextInput } from "../components/Field";
import { UpgradeModal } from "../components/UpgradeModal";

/** Default warm-wash surface for a list item. R-warm gallery primitive. */
const warmWashSurface: React.CSSProperties = {
  background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

/** Inline-styled warm-tile anchor for the item's leading emoji. */
const emojiTileStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
  flexShrink: 0,
};

export function Bucket() {
  const { data, loading, error, refetch, setData } = useApi(endpoints.listBucket);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** Item awaiting delete confirmation; null = no confirm modal open. */
  const [confirmingDelete, setConfirmingDelete] = useState<BucketItem | null>(null);
  /** Last action failure surfaced inline (matches the soft-error pattern used
   *  by sibling screens — see Mood.saveError / Gifts.sendError). Cleared on
   *  any successful subsequent action or when the user starts a new add. */
  const [actionError, setActionError] = useState<string | null>(null);
  /** Warm UpgradeModal trigger — opened by the LimitBanner's "Оформить Pro"
   *  CTA. Replaces the old native alert() so the limit-hit dialog matches
   *  the R-warm tone of every other screen. */
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const items = data ?? [];
  const atLimit = items.length >= DEFAULT_LIMITS.bucket;
  /** Active top-level tab. "dreams" = open items (default), "fulfilled" = the
   *  done-items timeline (Bundle D Task 1). */
  const [tab, setTab] = useState<"dreams" | "fulfilled">("dreams");

  async function submit() {
    // Synchronous busy guard: button `disabled` doesn't cover programmatic
    // submit (Enter key inside a TextInput, requestSubmit, etc.).
    if (busy) return;
    if (!title.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const item = await endpoints.addBucket({
        title: title.trim(),
        note: note.trim() || null,
      });
      setData((prev) => [item, ...(prev ?? [])]);
      setAdding(false);
      setTitle("");
      setNote("");
      haptic("success");
    } catch {
      // Optimistic update was NOT applied here — surface a soft inline error
      // AND refetch so server truth is reflected on next render. This matches
      // Mood.save()'s error UX.
      setActionError(COPY.common.sendFailed);
      refetch();
    } finally {
      setBusy(false);
    }
  }

  async function markDone(item: BucketItem) {
    setActionError(null);
    setData((prev) =>
      (prev ?? []).map((b) =>
        b.id === item.id ? { ...b, status: "done", completedAt: new Date().toISOString() } : b,
      ),
    );
    try {
      await endpoints.setBucketStatus(item.id, "done");
      haptic("success");
      // Dream-fulfilled ceremony (Bundle E Task 1): the FIRST fulfilled dream
      // gets a confetti burst; subsequent ones toast the running count.
      // We derive the post-flip done count from the current `data` snapshot
      // (this item isn't flipped yet here, so we add 1).
      const nextDone =
        (data ?? []).filter((b) => b.status === "done").length + 1;
      emitMilestone({ kind: "bucket_done_count", value: nextDone });
    } catch {
      setActionError(COPY.common.sendFailed);
      refetch();
    }
  }

  async function undo(item: BucketItem) {
    setActionError(null);
    setData((prev) =>
      (prev ?? []).map((b) => (b.id === item.id ? { ...b, status: "dreaming" } : b)),
    );
    try {
      await endpoints.setBucketStatus(item.id, "dreaming");
      haptic("light");
    } catch {
      setActionError(COPY.common.sendFailed);
      refetch();
    }
  }

  async function remove(item: BucketItem) {
    // Destructive action — the click handler is responsible for opening the
    // confirm modal; this is the "yes, really delete" path. Optimistic
    // remove + rollback on failure stays the same.
    setActionError(null);
    setData((prev) => (prev ?? []).filter((b) => b.id !== item.id));
    try {
      await endpoints.deleteBucket(item.id);
      haptic("light");
    } catch {
      setActionError(COPY.common.sendFailed);
      refetch();
    }
  }

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader
        emoji="🌌"
        title={COPY.bucket.heading}
        action={
          <Button
            variant="warm"
            onClick={() => setAdding(true)}
            disabled={atLimit}
            className="px-3 py-1.5"
            style={{ width: "auto" }}
          >
            + {COPY.common.add}
          </Button>
        }
      />

      {actionError ? (
        <p
          role="alert"
          className="text-sm text-[var(--tg-danger)]"
          style={{ marginTop: 8 }}
        >
          {actionError}
        </p>
      ) : null}

      {atLimit ? (
        <div className="mb-3">
          <LimitBanner
            text={COPY.bucket.limitHit}
            count={items.length}
            max={DEFAULT_LIMITS.bucket}
            onUpgrade={() => setUpgradeOpen(true)}
            onDeleteOld={() => setUpgradeOpen(true)}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="meta" style={{ textAlign: "center", padding: "40px 0" }}>{COPY.common.loading}</p>
      ) : error ? (
        <p className="meta" style={{ textAlign: "center", padding: "40px 0", color: "var(--tg-danger)" }}>{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState
          emoji="🌌"
          text={COPY.bucket.empty}
          hint={COPY.bucket.hint}
          action={{ label: `+ ${COPY.common.add}`, onClick: () => setAdding(true) }}
        />
      ) : (
        <>
        <div className="chip-row mb-3" data-testid="bucket-tab-row">
          <button
            type="button"
            className={`chip flex-1 text-center justify-center ${tab === "dreams" ? "active" : ""}`}
            onClick={() => setTab("dreams")}
            aria-pressed={tab === "dreams"}
          >
            {COPY.bucket.dreamsTab}
          </button>
          <button
            type="button"
            className={`chip flex-1 text-center justify-center ${tab === "fulfilled" ? "active" : ""}`}
            onClick={() => setTab("fulfilled")}
            aria-pressed={tab === "fulfilled"}
          >
            {COPY.bucket.fulfilledTab}
          </button>
        </div>

        {tab === "fulfilled" ? (
          (() => {
            const doneItems = items
              .filter((b) => b.status === "done")
              .sort((a, b) => {
                const ax = a.completedAt ? Date.parse(a.completedAt) : 0;
                const bx = b.completedAt ? Date.parse(b.completedAt) : 0;
                return bx - ax;
              });
            if (doneItems.length === 0) {
              return (
                <EmptyState
                  emoji="🌠"
                  text={COPY.bucket.fulfilledEmpty}
                />
              );
            }
            return (
              <ul className="flex flex-col gap-2">
                {doneItems.map((item) => {
                  const date = shortDate(item.completedAt);
                  return (
                    <li key={item.id}>
                      <div
                        className="card done"
                        style={{
                          ...warmWashSurface,
                          opacity: 0.85,
                        }}
                      >
                        <div className="card-row" style={{ alignItems: "flex-start", gap: 12 }}>
                          <span aria-hidden style={emojiTileStyle}>✨</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="card-title" style={{ textDecoration: "line-through" }}>
                              {item.title}
                            </p>
                            {item.note ? <p className="card-sub">{item.note}</p> : null}
                            {date ? (
                              <p className="meta" style={{ marginTop: 2 }}>
                                {COPY.bucket.fulfilledOn(date)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()
        ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const isDone = item.status === "done";
            return (
              <li key={item.id}>
                <div
                  className={isDone ? "card done" : "card"}
                  style={{
                    ...warmWashSurface,
                    // For done items we want the "fulfilled" dimmed treatment to
                    // be even softer on the warm-wash surface.
                    opacity: isDone ? 0.55 : 1,
                    // NOTE: status="planning" is part of BucketStatus and the
                    // backend accepts it (see bucketStatusLabel), but this UI
                    // doesn't expose a way to set/transition into it. Skipped
                    // here: a third "Планируем" toggle would need new copy and
                    // a new flow (date? countdown link?) — out of scope for
                    // the bucket-med sweep. Add when the planning UX is
                    // designed.
                  }}
                >
                  <div className="card-row" style={{ alignItems: "flex-start", gap: 12 }}>
                    <span aria-hidden style={emojiTileStyle}>
                      {isDone ? "🌠" : "🌌"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="card-title" style={isDone ? { textDecoration: "line-through" } : undefined}>
                        {item.title}
                      </p>
                      {item.note ? <p className="card-sub">{item.note}</p> : null}
                      <p className="meta" style={{ marginTop: 2 }}>{bucketStatusLabel(item.status)}</p>
                    </div>
                  </div>
                  <div className="card-actions">
                    {item.status !== "done" ? (
                      <button
                        type="button"
                        className="card-act warm"
                        onClick={() => markDone(item)}
                      >
                        Сбылось 🌌
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="card-act ghost"
                        onClick={() => undo(item)}
                      >
                        ↶ Мечтать
                      </button>
                    )}
                    <button
                      type="button"
                      className="card-act danger"
                      onClick={() => setConfirmingDelete(item)}
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
        </>
      )}

      <Modal
        open={adding}
        title={COPY.bucket.addPrompt}
        onClose={() => setAdding(false)}
        onSubmit={submit}
        submitDisabled={!title.trim() || busy}
      >
        <TextInput
          autoFocus
          placeholder={COPY.bucket.titlePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextInput
          placeholder={COPY.bucket.notePlaceholder}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Modal>

      <Modal
        open={confirmingDelete !== null}
        title={`Удалить мечту «${confirmingDelete?.title ?? ""}»?`}
        submitLabel={COPY.common.delete}
        submitVariant="danger"
        onClose={() => setConfirmingDelete(null)}
        onSubmit={() => {
          if (confirmingDelete) {
            const target = confirmingDelete;
            setConfirmingDelete(null);
            remove(target);
          }
        }}
      >
        <p className="card-sub" style={{ marginTop: 0 }}>
          Без возможности восстановить.
        </p>
      </Modal>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  );
}
