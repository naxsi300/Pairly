import { useEffect, useState } from "react";
import { COPY } from "../copy";
import { ApiError, endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type WishlistItem } from "../types";
import { CATEGORIES, categoryEmoji, categoryLabel } from "../lib/categories";
import { emitMilestone } from "../lib/milestoneBus";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { ScreenHeader } from "../components/ScreenHeader";
import { TextInput } from "../components/Field";

// R-warm item surface — replaces the flat `.card` so wishlist rows read as
// cards in the same warm-card language as the home feed. Active (non-done)
// rows get the stronger warm gradient so they pop at a glance.
const warmWash = {
  background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
} as const;
const warmWashActive = {
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 16%, var(--tg-sec)), color-mix(in srgb, var(--tg-warm) 6%, var(--tg-sec)))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
} as const;

const CATS = CATEGORIES.map((c) => c.id);

/**
 * Fetch a wishlist photo via the auth-header path and wrap the bytes in
 * an object URL the <img> can use. The previous implementation built a
 * `?init_data=…` URL — that leaked the Telegram-signed payload into any
 * Referer, browser history, or access log (e.g. Caddy).
 *
 * The hook:
 *   - calls `endpoints.wishlistPhotoBlob(itemId, signal)` on mount;
 *   - creates a fresh object URL whenever the bytes arrive;
 *   - revokes the previous URL before swapping and on unmount.
 *
 * `enabled=false` (default) means "do nothing" — useful when `item.hasPhoto`
 * is false or the user is filtering. Returns "" when there's nothing to show.
 */
function usePhotoBlob(itemId: string | null, enabled: boolean): string {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (!enabled || !itemId) {
      setUrl("");
      return;
    }
    const ctrl = new AbortController();
    let revoked = false;
    let createdUrl = "";
    (async () => {
      try {
        const blob = await endpoints.wishlistPhotoBlob(itemId, ctrl.signal);
        if (revoked) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      } catch {
        // Silent: the <img onError> handler hides the broken placeholder,
        // and useApi's refetch keeps the rest of the row correct.
        if (!revoked) setUrl("");
      }
    })();
    return () => {
      revoked = true;
      ctrl.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      // Also revoke whatever is currently in state (covers the case where
      // the effect re-runs before setUrl commits).
      setUrl((prev) => {
        if (prev && prev !== createdUrl) URL.revokeObjectURL(prev);
        return "";
      });
    };
  }, [itemId, enabled]);
  return url;
}

export function Wishlist() {
  const { data, loading, error, refetch, setData } = useApi(endpoints.listWishlist);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState<string>("");
  const [filter, setFilter] = useState<"active" | "done">("active");
  const [busy, setBusy] = useState(false);

  const items = data ?? [];
  // Gallery pattern: active vs done live in separate filter tabs, so a done
  // item never shows its reopen/delete actions next to an active one.
  const activeItems = items.filter((i) => i.status !== "done" && i.status !== "archived");
  const doneItems = items.filter((i) => i.status === "done");
  const shown = filter === "active" ? activeItems : doneItems;
  const atLimit = activeItems.length >= DEFAULT_LIMITS.wishlist;

  /** Reset add-modal fields on close/cancel and after a successful save. */
  function resetForm() {
    setTitle("");
    setAddress("");
    setCategory("");
  }
  const closeAdd = () => {
    resetForm();
    setAdding(false);
  };

  async function submit() {
    // Synchronous busy guard: button `disabled` doesn't cover programmatic
    // submit (Enter key inside a TextInput, requestSubmit, etc.).
    if (busy) return;
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
      resetForm();
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

  /** Two-tap consent: approve a pending forwarded item (partner action). */
  async function approve(item: WishlistItem) {
    setData((prev) => (prev ?? []).map((w) => (w.id === item.id ? { ...w, status: "open", mine: false } : w)));
    haptic("success");
    try {
      await endpoints.approveWishlist(item.id);
    } catch {
      refetch();
    }
  }

  /** Open the original Telegram post (t.me deep link) when available. */
  function openSource(item: WishlistItem) {
    if (!item.sourceUrl) return;
    haptic("light");
    // Telegram WebApp hosts an opener; fall back to window.open in a browser.
    const tg = (window as unknown as { Telegram?: { WebApp?: { openLink?: (u: string) => void } } }).Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(item.sourceUrl);
    else window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
  }

  /** "Хочу повторить": reopen THIS item in place (back to open) so you can do
   * it again. Does NOT spawn a duplicate — the same row becomes actionable. */
  async function repeat(item: WishlistItem) {
    setData((prev) => (prev ?? []).map((w) => (w.id === item.id ? { ...w, status: "open" } : w)));
    haptic("success");
    try {
      await endpoints.setWishlistStatus(item.id, "open");
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
      <ScreenHeader
        emoji="🗒"
        title={COPY.wishlist.heading}
        action={
          <button
            type="button"
            className="btn-warm"
            style={{ width: "auto", padding: "10px 16px", fontSize: 14 }}
            onClick={() => setAdding(true)}
            disabled={atLimit}
          >
            + {COPY.common.add}
          </button>
        }
      />

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
        <p className="meta py-10 text-center">{COPY.common.loading}</p>
      ) : error ? (
        <p className="py-10 text-center text-[var(--tg-danger)]">{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState emoji="🗒" text={COPY.wishlist.empty} />
      ) : (
        <>
        <div className="chip-row mb-1">
          <button
            type="button"
            className={`chip flex-1 text-center justify-center ${filter === "active" ? "active" : ""}`}
            onClick={() => setFilter("active")}
          >
            📋 Активные ({activeItems.length})
          </button>
          <button
            type="button"
            className={`chip flex-1 text-center justify-center ${filter === "done" ? "active" : ""}`}
            onClick={() => setFilter("done")}
          >
            ✓ Сделано ({doneItems.length})
          </button>
        </div>

        {shown.length === 0 ? (
          <EmptyState emoji={filter === "done" ? "✅" : "🗒"} text={filter === "done" ? "Пока ничего не отмечено" : COPY.wishlist.empty} />
        ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((item) => (
            <li key={item.id}>
              <div
                style={{
                  ...(item.status === "done" ? warmWash : warmWashActive),
                  opacity: item.status === "done" ? 0.6 : 1,
                }}
              >
                <div className="card-row">
                  <PhotoThumb item={item} />
                  <ItemBody
                    item={item}
                    onOpenSource={() => openSource(item)}
                  />
                </div>
                <div className="card-actions">
                  {item.status === "pending" ? (
                    item.mine ? (
                      <div className="banner banner-warm flex-1 px-3 py-2">
                        <span className="emoji">⏳</span>
                        <div className="card-sub flex-1">ждёт согласия партнёра</div>
                      </div>
                    ) : (
                      <>
                        <div className="banner banner-blue flex-1 px-3 py-2">
                          <span className="emoji">👈</span>
                          <div className="card-sub flex-1">партнёр предлагает — подтвердите</div>
                        </div>
                        <button type="button" className="card-act warm" onClick={() => approve(item)} disabled={busy}>
                          👍 Ок
                        </button>
                      </>
                    )
                  ) : item.status !== "done" ? (
                    <button type="button" className="card-act primary" onClick={() => markDone(item)}>
                      ✅ Сделано
                    </button>
                  ) : (
                    <button type="button" className="card-act warm" onClick={() => repeat(item)} disabled={busy}>
                      ↶ {COPY.wishlist.repeat}
                    </button>
                  )}
                  <button type="button" className="card-act danger" aria-label="Удалить" onClick={() => remove(item)}>
                    🗑
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        )}
        </>
      )}

      <Modal
        open={adding}
        title={COPY.wishlist.addPrompt}
        onClose={closeAdd}
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
              className={`chip ripple-container ${category === c ? "active" : ""}`}
            >
              {categoryEmoji(c)} {categoryLabel(c)}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** The clickable title/notes area of a wishlist card. Tapping opens the original
 * Telegram post when one was captured at forward time (sourceUrl). */
function ItemBody({ item, onOpenSource }: { item: WishlistItem; onOpenSource: () => void }) {
  const clickable = !!item.sourceUrl;
  return (
    <div
      className="min-w-0 flex-1"
      style={{ cursor: clickable ? "pointer" : "default" }}
      onClick={clickable ? onOpenSource : undefined}
    >
      <div className="card-title truncate">
        {item.title}
        {clickable ? <span className="meta ml-1.5">↗</span> : null}
      </div>
      {item.address ? (
        <div className="card-sub truncate">📍 {item.address}</div>
      ) : null}
      {item.notes ? (
        <div className="card-sub line-clamp-2">{item.notes}</div>
      ) : null}
      {clickable ? <div className="card-sub mt-0.5">Открыть оригинал в Telegram ↗</div> : null}
    </div>
  );
}

/** Photo thumbnail for a wishlist row. Fetches the bytes via the auth
 * header (never via a query param) and wraps them in an object URL. On
 * unmount / item change the URL is revoked to avoid leaks. Falls back to
 * the category emoji in a warm tile when the item has no photo or the fetch
 * fails — so every row has an emoji anchor at a glance. */
function PhotoThumb({ item }: { item: WishlistItem }) {
  const url = usePhotoBlob(item.hasPhoto ? item.id : null, !!item.hasPhoto);
  if (!item.hasPhoto || !url) {
    return (
      <span
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          flexShrink: 0,
          background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
        }}
      >
        {categoryEmoji(item.category)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="w-14 h-14 rounded-2xl object-cover shrink-0"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
