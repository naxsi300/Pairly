import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type BucketItem } from "../types";
import { bucketStatusLabel } from "../lib/format";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { ScreenHeader } from "../components/ScreenHeader";
import { TextInput } from "../components/Field";

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

  const items = data ?? [];
  const atLimit = items.length >= DEFAULT_LIMITS.bucket;

  async function submit() {
    // Synchronous busy guard: button `disabled` doesn't cover programmatic
    // submit (Enter key inside a TextInput, requestSubmit, etc.).
    if (busy) return;
    if (!title.trim()) return;
    setBusy(true);
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
      refetch();
    } finally {
      setBusy(false);
    }
  }

  async function markDone(item: BucketItem) {
    setData((prev) =>
      (prev ?? []).map((b) =>
        b.id === item.id ? { ...b, status: "done", completedAt: new Date().toISOString() } : b,
      ),
    );
    haptic("success");
    try {
      await endpoints.setBucketStatus(item.id, "done");
    } catch {
      refetch();
    }
  }

  async function undo(item: BucketItem) {
    setData((prev) =>
      (prev ?? []).map((b) => (b.id === item.id ? { ...b, status: "dreaming" } : b)),
    );
    haptic("light");
    try {
      await endpoints.setBucketStatus(item.id, "dreaming");
    } catch {
      refetch();
    }
  }

  async function remove(item: BucketItem) {
    // Destructive action — the click handler is responsible for opening the
    // confirm modal; this is the "yes, really delete" path. Optimistic
    // remove + rollback on failure stays the same.
    setData((prev) => (prev ?? []).filter((b) => b.id !== item.id));
    haptic("light");
    try {
      await endpoints.deleteBucket(item.id);
    } catch {
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

      {atLimit ? (
        <div className="mb-3">
          <LimitBanner
            text={COPY.bucket.limitHit}
            count={items.length}
            max={DEFAULT_LIMITS.bucket}
            onUpgrade={() => alert("Pro: оплата подключается позже (USDT/СБП).")}
            onDeleteOld={() => alert("Отпустите или удалите старую мечту.")}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="meta" style={{ textAlign: "center", padding: "40px 0" }}>{COPY.common.loading}</p>
      ) : error ? (
        <p className="meta" style={{ textAlign: "center", padding: "40px 0", color: "var(--tg-danger)" }}>{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState emoji="🌌" text={COPY.bucket.empty} hint={COPY.bucket.hint} />
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
                    gap: 8,
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
                      <>
                        <span className="meta" style={{ alignSelf: "center" }}>🌌 сбылось</span>
                        <button
                          type="button"
                          className="card-act ghost"
                          onClick={() => undo(item)}
                        >
                          ↶ Мечтать
                        </button>
                      </>
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
    </div>
  );
}
