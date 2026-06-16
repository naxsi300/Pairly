import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi, type GiftsResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import type { GiftItem, GiftStatus } from "../types";
import { giftStatusLabel } from "../lib/format";
import { emitMilestone } from "../lib/milestoneBus";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { TextInput } from "../components/Field";

// Default catalog: docs/copy/gift-catalog.md (12 non-material gestures).
export const GIFT_CATALOG = [
  { gesture: "Завтрак в постель", description: "Утром я всё принесу сам(а). Тебе можно валяться." },
  { gesture: "Массаж", description: "15 минут, без спешки. Плечи, спина — как скажешь." },
  { gesture: "Ты выбираешь фильм", description: "Сегодня вечером выбираешь ты. Я не ворчу." },
  { gesture: "Домашний ужин", description: "Я готовлю. Ты просто садишься за стол." },
  { gesture: "Тихий час для тебя", description: "Один час без дел и меня. Я беру на себя всё остальное." },
  { gesture: "Прогулка вдвоём", description: "Просто идём куда глаза глядят. Без плана." },
  { gesture: "Кофе с утра готов", description: "Просыпаешься — кофе уже ждёт. Как любишь." },
  { gesture: "Ты спишь, я убираю", description: "Пока ты отдыхаешь, я разгребаю квартиру." },
  { gesture: "Ванна для тебя", description: "Я набираю. Полотенце, свечи, покой. Время твоё." },
  { gesture: "Плейлист вечера — твой", description: "Весь вечер звучит то, что хочешь ты. Без моих вето." },
  { gesture: "Обнимашки по требованию", description: "Без повода, без разговоров. Просто подойди." },
  { gesture: "Сладкое за тебя", description: "Сегодня за десертом хожу я. Какое твоё?" },
] as const;

type Action = "accept" | "decline" | "redeem" | "complete";

export function Gifts() {
  const { data, loading, error, refetch, setData } = useApi<GiftsResponse>(endpoints.listGifts);
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  const partnerName = data?.partnerName ?? "Партнёр";

  const active = items.filter((g) => !["declined", "archived"].includes(g.status));
  const goodDeeds = items.filter((g) => g.status === "complete");

  async function send(gesture: string, description?: string | null) {
    setBusy(true);
    try {
      const item = (await endpoints.sendGift({
        gesture,
        description: description ?? null,
      })) as GiftItem & { newMilestones?: { kind: string; value: number }[] };
      setData((prev) => ({
        ...(prev ?? ({} as GiftsResponse)),
        items: [item, ...(prev?.items ?? [])],
      }));
      haptic("success");
      for (const m of item.newMilestones ?? []) {
        emitMilestone({ kind: m.kind, value: m.value });
      }
    } catch {
      refetch();
    } finally {
      setBusy(false);
    }
  }

  async function act(item: GiftItem, action: Action) {
    const nextStatus: Record<Action, GiftStatus> = {
      accept: "claimed",
      decline: "declined",
      redeem: "redeemed",
      complete: "complete",
    };
    const targetStatus = nextStatus[action];
    setData((prev) => ({
      ...(prev ?? ({} as GiftsResponse)),
      items: (prev?.items ?? []).map((g) =>
        g.id === item.id ? { ...g, status: targetStatus } : g,
      ),
    }));
    haptic(action === "decline" ? "light" : "success");
    try {
      await endpoints.actOnGift(item.id, targetStatus);
    } catch {
      refetch();
    }
  }

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-tg-text">{COPY.gifts.heading}</h1>
        <Button onClick={() => setPicking(true)} disabled={busy}>
          🎁 {COPY.common.add}
        </Button>
      </header>

      {loading ? (
        <p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>
      ) : error ? (
        <p className="py-10 text-center text-red-500">{COPY.common.error}</p>
      ) : items.length === 0 ? (
        <EmptyState emoji="🎁" text={COPY.gifts.empty} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {active.map((g) => (
              <li key={g.id}>
                <Card>
                  <p className="text-[15px] font-medium text-tg-text">{g.gesture}</p>
                  {g.description ? (
                    <p className="mt-1 text-sm text-tg-hint">{g.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-tg-hint">
                    {g.direction === "me" ? `→ ${partnerName}` : "← партнёр"} ·{" "}
                    {giftStatusLabel(g.status)}
                  </p>

                  {/* Recipient actions when they receive a gift. */}
                  {g.direction === "them" && g.status === "received" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => act(g, "accept")}>{COPY.gifts.acceptButton}</Button>
                      <Button variant="secondary" onClick={() => act(g, "decline")}>
                        {COPY.gifts.declineButton}
                      </Button>
                    </div>
                  ) : null}

                  {/* Giver marks redeemed after the recipient claimed. */}
                  {g.direction === "me" && g.status === "claimed" ? (
                    <div className="mt-3">
                      <Button onClick={() => act(g, "redeem")}>{COPY.gifts.redeemButton}</Button>
                    </div>
                  ) : null

                  /* Either partner can move redeemed → complete (good deeds). */
                  }
                  {g.status === "redeemed" ? (
                    <div className="mt-3">
                      <Button onClick={() => act(g, "complete")}>
                        {COPY.gifts.completeButton}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>

          {goodDeeds.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tg-hint">
                {COPY.gifts.goodDeedsHeading}
              </h2>
              {/* Chronological, NOT ranked. */}
              <ul className="flex flex-col gap-1.5">
                {goodDeeds.map((g) => (
                  <li key={g.id} className="text-sm text-tg-text">
                    💛 {g.gesture}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {/* Gift picker: catalog grid + custom entry. */}
      <Modal open={picking} onClose={() => setPicking(false)} title={COPY.gifts.sendPrompt(partnerName)}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GIFT_CATALOG.map((g) => (
            <button
              key={g.gesture}
              type="button"
              disabled={busy}
              onClick={() => {
                void send(g.gesture, g.description);
                setPicking(false);
              }}
              className="rounded-2xl bg-tg-secondary p-3 text-left transition active:scale-[0.98] disabled:opacity-50"
            >
              <p className="text-sm font-medium text-tg-text">{g.gesture}</p>
              <p className="mt-0.5 text-xs text-tg-hint">{g.description}</p>
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          full
          onClick={() => {
            setPicking(false);
            setCustomOpen(true);
          }}
        >
          {COPY.gifts.customButton}
        </Button>
      </Modal>

      <Modal
        open={customOpen}
        title={COPY.gifts.customPrompt}
        onClose={() => setCustomOpen(false)}
        onSubmit={() => {
          if (custom.trim()) {
            void send(custom.trim(), null);
            setCustom("");
            setCustomOpen(false);
          }
        }}
        submitDisabled={!custom.trim() || busy}
      >
        <TextInput
          autoFocus
          placeholder="Например: ленивое воскресенье"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      </Modal>
    </div>
  );
}
