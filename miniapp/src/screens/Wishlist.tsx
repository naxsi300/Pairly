import { useState } from "react";
import { COPY } from "../copy";
import { ApiError, endpoints, useApi } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { DEFAULT_LIMITS, type WishlistItem } from "../types";
import { CATEGORIES, categoryEmoji, categoryLabel } from "../lib/categories";
import { emitMilestone } from "../lib/milestoneBus";
import { EmptyState } from "../components/EmptyState";
import { LimitBanner } from "../components/LimitBanner";
import { Modal } from "../components/Modal";
import { TextInput } from "../components/Field";

const CATS = CATEGORIES.map((c) => c.id);

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
      <h1 className="heading">{COPY.wishlist.heading}</h1>
      <button type="button" className="btn-warm" onClick={() => setAdding(true)} disabled={atLimit} style={{ marginBottom: 12 }}>
        + {COPY.common.add}
      </button>

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
        <>
        <div className="chip-row" style={{ marginBottom: 4 }}>
          <button
            type="button"
            className={`chip ${filter === "active" ? "active" : ""}`}
            style={{ flex: 1, textAlign: "center", justifyContent: "center" }}
            onClick={() => setFilter("active")}
          >
            📋 Активные ({activeItems.length})
          </button>
          <button
            type="button"
            className={`chip ${filter === "done" ? "active" : ""}`}
            style={{ flex: 1, textAlign: "center", justifyContent: "center" }}
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
              <div className={`card ${item.status === "done" ? "done" : ""}`}>
                <div className="card-row">
                  {item.hasPhoto ? (
                    <img
                      src={endpoints.wishlistPhotoUrl(item.id)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                      style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <span className="emoji" style={{ fontSize: 28 }}>{categoryEmoji(item.category)}</span>
                  )}
                  <ItemBody
                    item={item}
                    onOpenSource={() => openSource(item)}
                  />
                </div>
                <div className="card-actions">
                  {item.status === "pending" ? (
                    item.mine ? (
                      <div className="banner banner-warm" style={{ flex: 1, padding: "8px 12px" }}>
                        <span className="emoji">⏳</span>
                        <div style={{ flex: 1, fontSize: 13 }}>ждёт согласия партнёра</div>
                      </div>
                    ) : (
                      <>
                        <div className="banner banner-blue" style={{ flex: 1, padding: "8px 12px" }}>
                          <span className="emoji">👈</span>
                          <div style={{ flex: 1, fontSize: 13 }}>партнёр предлагает — подтвердите</div>
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
      style={{ minWidth: 0, flex: 1, cursor: clickable ? "pointer" : "default" }}
      onClick={clickable ? onOpenSource : undefined}
    >
      <div className="card-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.title}
        {clickable ? <span style={{ fontSize: 13, color: "var(--tg-button)", marginLeft: 6 }}>↗</span> : null}
      </div>
      {item.address ? (
        <div className="card-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {item.address}</div>
      ) : null}
      {item.notes ? (
        <div className="card-sub" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.notes}</div>
      ) : null}
      {clickable ? <div className="card-sub" style={{ marginTop: 2 }}>Открыть оригинал в Telegram ↗</div> : null}
    </div>
  );
}
