import { useState } from "react";
import { COPY } from "../copy";
import { ApiError, endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type WishlistItem } from "../types";
import { wishlistCategoryLabel, wishlistStatusLabel } from "../lib/format";
import { emitMilestone } from "../lib/milestoneBus";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { TextInput } from "../components/Field";

const CATS = ["eat", "do", "stay", "watch", "buy"] as const;

export function Wishlist() {
  const { data, loading, error, refetch, setData } = useApi(endpoints.listWishlist);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const items = data ?? [];
  const atLimit = items.length >= DEFAULT_LIMITS.wishlist;

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      // The API response includes newMilestones (if any) — show a soft toast.
      const item = await endpoints.addWishlist({
        title: title.trim(),
        address: address.trim() || null,
        category: category || null,
      }) as WishlistItem & { newMilestones?: { kind: string; value: number }[] };
      setData((prev) => [item, ...(prev ?? [])]);
      setAdding(false);
      setTitle("");
      setAddress("");
      setCategory("");
      haptic("success");
      for (const m of item.newMilestones ?? []) {
        emitMilestone({ kind: m.kind, value: m.value });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        // limit hit on the backend — surface the warm banner via a no-op refetch
        refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  async function markDone(item: WishlistItem) {
    setData((prev) => (prev ?? []).map((w) => (w.id === item.id ? { ...w, status: "done" } : w)));
    haptic("success");
    try {
      await endpoints.markDone(item.id);
    } catch {
      refetch();
    }
  }

  async function undo(item: WishlistItem) {
    setData((prev) => (prev ?? []).map((w) => (w.id === item.id ? { ...w, status: "open" } : w)));
    haptic("light");
    try {
      await endpoints.setWishlistStatus(item.id, "open");
    } catch {
      refetch();
    }
  }

  /** "Хочу повторить": create a fresh open wish from a done one (keeps the
   * completed item as history; the repeat is a new idea to look forward to). */
  async function repeat(item: WishlistItem) {
    setBusy(true);
    try {
      const created = await endpoints.addWishlist({
        title: item.title,
        address: item.address ?? null,
        category: item.category ?? null,
      }) as WishlistItem & { newMilestones?: { kind: string; value: number }[] };
      setData((prev) => [created, ...(prev ?? [])]);
      haptic("success");
      for (const m of created.newMilestones ?? []) {
        emitMilestone({ kind: m.kind, value: m.value });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: WishlistItem) {
    setData((prev) => (prev ?? []).filter((w) => w.id !== item.id));
    haptic("light");
    try {
      await endpoints.deleteWishlist(item.id);
    } catch {
      refetch();
    }
  }

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-tg-text">{COPY.wishlist.heading}</h1>
        <Button onClick={() => setAdding(true)} disabled={atLimit}>
          + {COPY.common.add}
        </Button>
      </header>

      {atLimit ? (
        <div className="mb-3">
          <LimitBanner
            text={COPY.wishlist.limitHit}
            count={items.length}
            max={DEFAULT_LIMITS.wishlist}
            onUpgrade={() => alert("Pro: оплата подключается позже (USDT/СБП).")}
            onDeleteOld={() => alert("Отметьте или удалите старую хотелку.")}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>
      ) : error ? (
        <p className="py-10 text-center text-red-500">{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState emoji="🗒" text={COPY.wishlist.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex items-start gap-3">
                  {item.hasPhoto ? (
                    <img
                      src={endpoints.wishlistPhotoUrl(item.id)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        // Telegram temp URL expired or lookup failed — hide cleanly.
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                      className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium leading-snug text-tg-text">{item.title}</p>
                    {item.address ? (
                      <p className="mt-0.5 truncate text-sm text-tg-hint">📍 {item.address}</p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-tg-hint">{item.notes}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-tg-hint">
                      {[wishlistCategoryLabel(item.category), wishlistStatusLabel(item.status)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.status !== "done" ? (
                    <Button variant="secondary" onClick={() => markDone(item)}>
                      ✅ Сделано
                    </Button>
                  ) : (
                    <>
                      <span className="self-center text-sm text-tg-hint">✅ сделано</span>
                      <Button variant="ghost" onClick={() => repeat(item)} disabled={busy}>
                        {COPY.wishlist.repeat}
                      </Button>
                      <Button variant="ghost" onClick={() => undo(item)}>
                        ↶ Отменить
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
        title={COPY.wishlist.addPrompt}
        onClose={() => setAdding(false)}
        onSubmit={submit}
        submitDisabled={!title.trim() || busy}
      >
        <TextInput
          autoFocus
          placeholder={COPY.wishlist.titlePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextInput
          placeholder={COPY.wishlist.addressPlaceholder}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? "" : c)}
              aria-pressed={category === c}
              className="ripple-container rounded-full px-3 py-1.5 text-sm transition"
              style={{
                background: category === c
                  ? "var(--m3-primary-container)"
                  : "var(--m3-surface-container)",
                color: category === c
                  ? "var(--m3-on-primary-container)"
                  : "var(--m3-on-surface)",
              }}
            >
              {wishlistCategoryLabel(c)}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
