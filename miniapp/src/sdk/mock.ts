/**
 * Mock data + mock fetch implementation. Used when VITE_USE_MOCK === "true".
 *
 * Returns canned Russian data so the UI is fully demonstrable standalone, before
 * the FastAPI backend + Telegram initData auth are wired (see open-decisions.md #4).
 *
 * The mock honours the same endpoints as the real client (see src/sdk/api.ts):
 *   GET  /api/wishlist        GET  /api/bucket
 *   GET  /api/countdowns      GET  /api/mood
 *   GET  /api/qotd            GET  /api/gifts
 *   POST /api/wishlist        POST /api/bucket        POST /api/countdown
 *   POST /api/mood            POST /api/qotd/answer
 *   POST /api/mark-done       POST /api/gift          POST /api/gift/<id>/<action>
 *   DELETE /api/wishlist/<id> DELETE /api/bucket/<id> DELETE /api/countdown/<id>
 */
import type {
  BucketItem,
  Countdown,
  GiftItem,
  MoodEntry,
  QOTDState,
  WishlistItem,
} from "../types";

const now = Date.now();
const iso = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString();

let wishlist: WishlistItem[] = [
  { id: "w1", title: "Пицца на Маросейке", address: "Маросейка 2/15", category: "eat", status: "open", mine: true, sourceUrl: "https://t.me/restochannel/1234" },
  { id: "w2", title: "Дора на Патриках", address: null, category: "eat", status: "planned", eventDate: iso(7), mine: true },
  { id: "w3", title: "«Дюна» в кино", address: "Октябрь", category: "watch", status: "done", mine: true },
  { id: "w4", title: "Джаз-вечер в «Союзе»", address: null, category: "do", status: "pending", mine: false, sourceUrl: "https://t.me/afisha/5678", notes: "В субботу, 20:00. Билеты от 1500₽." },
];

let bucket: BucketItem[] = [
  { id: "b1", title: "Увидеть северное сияние", note: "где-нибудь за полярным кругом", category: "путешествия", status: "dreaming" },
  { id: "b2", title: "Съездить на океан", note: null, category: null, status: "planning" },
  { id: "b3", title: "Выучить язык вместе", note: "испанский?", category: null, status: "done", completedAt: iso(-120) },
];

let countdowns: Countdown[] = [
  { id: "c1", label: "Отпуск", emoji: "🏝", targetDate: iso(40), recurrence: null },
  { id: "c2", label: "Годовщина", emoji: "💛", targetDate: iso(2), recurrence: "annual" },
  { id: "c3", label: "Познакомились", emoji: "📅", targetDate: iso(-900), recurrence: "annual" },
  { id: "c4", label: "Знакомство", emoji: "💛", targetDate: iso(-412), recurrence: "milestone" },
];

let moodSelf: MoodEntry | null = { mood: "хорошо", note: "тёплый день", setAt: new Date(now - 3 * 3600_000).toISOString() };
let moodPartner: MoodEntry | null = { mood: "сияю", note: null, setAt: new Date(now - 5 * 3600_000).toISOString() };

let gifts: GiftItem[] = [
  { id: "g1", gesture: "Завтрак в постель", description: "Утром я всё принесу сам(а).", status: "claimed", direction: "them", createdAt: iso(-1) },
  { id: "g2", gesture: "Ты выбираешь фильм", description: "Сегодня вечером выбираешь ты.", status: "received", direction: "me", createdAt: iso(0) },
  { id: "g3", gesture: "Массаж", description: "15 минут, без спешки.", status: "complete", direction: "me", createdAt: iso(-9) },
];

let qotd: QOTDState = {
  question: { id: "q1", text: "Если бы можно было телепортироваться на ужин куда угодно — куда бы мы поехали прямо сейчас?", category: "мечты" },
  myAnswer: null,
  partnerAnswered: false,
  partnerAnswer: null,
};

const partnerName = "Партнёр";

// Demo-only Pro toggle (the hidden admin menu flips this in mock mode).
let pro = false;

/**
 * E2E SEAM: Playwright (or any test harness) can override mock state via
 * `window.__PAIRLY_E2E__` BEFORE the page loads app code. e.g.:
 *   await page.addInitScript(() => {
 *     window.__PAIRLY_E2E__ = { qotd: { myAnswer: null, partnerAnswer: "секрет" } };
 *   });
 * Currently supported overrides: `qotd` (partial — merged with the canned state).
 * This is the seam that lets a canary reveal-gate test plant a known partner answer
 * without touching the network. See e2e/specs/qotd.spec.ts.
 */
function applyE2EOverrides() {
  const e = (globalThis as unknown as { __PAIRLY_E2E__?: { qotd?: Partial<QOTDState> } }).__PAIRLY_E2E__;
  if (!e?.qotd) return;
  qotd = { ...qotd, ...e.qotd };
}
applyE2EOverrides();

let delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function rid(): string {
  return "id-" + Math.random().toString(36).slice(2, 10);
}

/** Route a mock request. Returns a Response. */
export async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await delay();
  const rawUrl = typeof input === "string" ? input : (input as Request).url ?? String(input);
  // URL may be absolute or relative ("/api/..."). new URL needs a base.
  const url = rawUrl.startsWith("http")
    ? new URL(rawUrl)
    : new URL(rawUrl, "http://mock.local");
  const path = url.pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : {};

  // GETs
  if (method === "GET") {
    switch (path) {
      case "/api/wishlist":
        return json(wishlist);
      case "/api/bucket":
        return json(bucket);
      case "/api/countdowns":
        return json(countdowns);
      case "/api/mood":
        return json({ self: moodSelf, partner: moodPartner, partnerName });
      case "/api/qotd":
        return json({ ...qotd, partnerName });
      case "/api/gifts":
        return json({ items: gifts, partnerName });
      case "/api/pair/stats":
        return json({
          togetherDays: 42,
          totalWishlist: wishlist.length,
          wishlistDone: wishlist.filter((w) => w.status === "done").length,
          totalGifts: gifts.length,
          giftsCompleted: 0,
          totalQotdAnswers: 3,
          totalCountdowns: countdowns.length,
          createdAt: new Date(now - 42 * 86_400_000).toISOString(),
          isPro: pro,
        });
      case "/api/admin/status":
        // Mock: always admin-enabled in demo so the hidden menu works locally.
        return json({ pairId: "demo-pair", userId: "demo-user", tgId: 0, tier: pro ? "pro" : "free", isPro: pro, adminEnabled: true });
      case "/api/date-idea": {
        const m = url.searchParams.get("mode");
        if (m === "smart") {
          return json({ source: "wishlist", title: wishlist[0]?.title ?? "Уютный киновечер", category: "watch", reason: "По вашему настроению и вишлисту — отличный выбор на вечер ✨" });
        }
        if (m === "lucky") {
          return json({ source: "ai", title: "Сварить какао и строить подушечный форт", category: "stay", reason: "Что-то новое и тёплое — просто потому что повезёт 🍀" });
        }
        return json({ source: "wishlist", title: wishlist[0]?.title ?? "Прогулка по набережной", category: "do", reason: "Это из вашего wishlist — давно хотели, пора воплотить ✨" });
      }
      case "/api/love-notes":
        return json([
          { id: "ln1", body: "Доброе утро, любимый 🌅", deliverAt: "09:00", mine: false, readByRecipient: false, createdAt: new Date(now - 2 * 3600_000).toISOString() },
          { id: "ln2", body: "Спасибо за вчерашний вечер 💛", deliverAt: null, mine: true, readByRecipient: true, createdAt: new Date(now - 26 * 3600_000).toISOString() },
        ]);
      default:
        return json({ status: "ok" }, 200);
    }
  }

  // POSTs
  if (method === "POST") {
    switch (path) {
      case "/api/wishlist":
        wishlist = [{ id: rid(), status: "open", ...body }, ...wishlist];
        return json(wishlist[0], 201);
      case "/api/mark-done": {
        wishlist = wishlist.map((w) =>
          w.id === body.item_id ? { ...w, status: "done" } : w,
        );
        return json(wishlist.find((w) => w.id === body.item_id) ?? body, 200);
      }
      case "/api/bucket":
        bucket = [{ id: rid(), status: "dreaming", completedAt: null, ...body }, ...bucket];
        return json(bucket[0], 201);
      case "/api/countdowns":
        countdowns = [{ id: rid(), recurrence: null, ...body }, ...countdowns];
        return json(countdowns[0], 201);
      case "/api/mood":
        moodSelf = { mood: body.mood, note: body.note ?? null, setAt: new Date().toISOString() };
        return json(moodSelf, 200);
      case "/api/qotd/answer":
        qotd = { ...qotd, myAnswer: body.answer as string };
        return json(qotd, 200);
      case "/api/admin/toggle-pro":
        pro = !pro;
        return json({ isPro: pro }, 200);
      case "/api/love-notes":
        return json({ id: rid(), body: body.body, deliverAt: body.deliverAt ?? null, mine: true, readByRecipient: false, createdAt: new Date().toISOString() }, 201);
      case "/api/gift":
        gifts = [
          { id: rid(), description: null, status: "received", direction: "me", createdAt: new Date().toISOString(), ...body },
          ...gifts,
        ];
        return json(gifts[0], 201);
      default:
        if (path.startsWith("/api/wishlist/")) {
          const [, , id, action] = path.split("/");
          if (action === "approve") {
            wishlist = wishlist.map((w) => (w.id === id ? { ...w, status: "open", mine: false } : w));
            return json(wishlist.find((w) => w.id === id) ?? {}, 200);
          }
          if (action === "status") {
            wishlist = wishlist.map((w) => (w.id === id ? { ...w, status: body.status } : w));
            return json(wishlist.find((w) => w.id === id) ?? {}, 200);
          }
        }
        if (path.startsWith("/api/gift/")) {
          const [, , id, action] = path.split("/");
          const next: Record<string, GiftItem["status"]> = {
            accept: "claimed",
            decline: "declined",
            redeem: "redeemed",
            complete: "complete",
          };
          gifts = gifts.map((g) => (g.id === id ? { ...g, status: next[action] ?? g.status } : g));
          return json(gifts.find((g) => g.id === id) ?? {}, 200);
        }
        return json({ ok: true });
    }
  }

  if (method === "PATCH") {
    if (path.startsWith("/api/countdowns/")) {
      const id = path.split("/")[3];
      countdowns = countdowns.map((c) => (c.id === id ? { ...c, ...body } : c));
      return json(countdowns.find((c) => c.id === id) ?? body, 200);
    }
    return json({ ok: true });
  }

  if (method === "DELETE") {
    if (path === "/api/mood") {
      moodSelf = null;
      return json({ ok: true });
    }
    if (path.startsWith("/api/wishlist/")) {
      const id = path.split("/")[3];
      wishlist = wishlist.filter((w) => w.id !== id);
      return json({ ok: true });
    }
    if (path.startsWith("/api/bucket/")) {
      const id = path.split("/")[3];
      bucket = bucket.filter((b) => b.id !== id);
      return json({ ok: true });
    }
    if (path.startsWith("/api/countdown/")) {
      const id = path.split("/")[3];
      countdowns = countdowns.filter((c) => c.id !== id);
      return json({ ok: true });
    }
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}
