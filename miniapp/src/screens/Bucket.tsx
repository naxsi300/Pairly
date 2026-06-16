import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type BucketItem } from "../types";
import { bucketStatusLabel } from "../lib/format";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { TextInput } from "../components/Field";

export function Bucket() {
  const { data, loading, error, refetch, setData } = useApi(endpoints.listBucket);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const items = data ?? [];
  const atLimit = items.length >= DEFAULT_LIMITS.bucket;

  async function submit() {
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
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-tg-text">{COPY.bucket.heading}</h1>
        <Button onClick={() => setAdding(true)} disabled={atLimit}>
          + {COPY.common.add}
        </Button>
      </header>

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
        <p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>
      ) : error ? (
        <p className="py-10 text-center text-red-500">{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState emoji="🌌" text={COPY.bucket.empty} hint={COPY.bucket.hint} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <p className="text-[15px] font-medium text-tg-text">{item.title}</p>
                {item.note ? <p className="mt-1 text-sm text-tg-hint">{item.note}</p> : null}
                <p className="mt-1 text-xs text-tg-hint">{bucketStatusLabel(item.status)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.status !== "done" ? (
                    <Button variant="secondary" onClick={() => markDone(item)}>
                      Сбылось 🌌
                    </Button>
                  ) : (
                    <>
                      <span className="self-center text-sm text-tg-hint">🌌 сбылось</span>
                      <Button variant="ghost" onClick={() => undo(item)}>
                        ↶ Мечтать
                      </Button>
                    </>
                  )}
                  <Button variant="danger" onClick={() => remove(item)}>
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
    </div>
  );
}
