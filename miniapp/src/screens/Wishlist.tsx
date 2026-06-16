import { useState } from "react";
import { COPY } from "../copy";
import { ApiError, endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type WishlistItem } from "../types";
import { wishlistCategoryLabel, wishlistStatusLabel } from "../lib/format";
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
      const item = await endpoints.addWishlist({
        title: title.trim(),
        address: address.trim() || null,
        category: category || null,
      });
      setData((prev) => [item, ...(prev ?? [])]);
      setAdding(false);
      setTitle("");
      setAddress("");
      setCategory("");
      haptic("success");
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
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-tg-text">{item.title}</p>
                    {item.address ? (
                      <p className="mt-0.5 truncate text-sm text-tg-hint">📍 {item.address}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-tg-hint">
                      {[wishlistCategoryLabel(item.category), wishlistStatusLabel(item.status)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {item.status !== "done" ? (
                    <Button variant="secondary" onClick={() => markDone(item)}>
                      ✅ Сделано
                    </Button>
                  ) : (
                    <span className="self-center text-sm text-tg-hint">✅ сделано</span>
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
              className={`rounded-full px-3 py-1.5 text-sm ${
                category === c
                  ? "bg-tg-button text-tg-buttonText"
                  : "bg-tg-secondary text-tg-text"
              }`}
            >
              {wishlistCategoryLabel(c)}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
