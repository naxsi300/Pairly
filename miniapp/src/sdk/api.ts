/**
 * API client + `useApi` hook.
 *
 * Design (open-decisions.md #3, #4, #5):
 *  - Hand-rolled fetch wrapper; no SWR/React Query (surface is tiny).
 *  - Mock mode behind VITE_USE_MOCK returns canned data (see mock.ts).
 *  - Auth: in production we send the raw Telegram WebApp `initData` as
 *    `X-Telegram-Init-Data`; the backend HMAC-verifies it and resolves the user.
 *  - In dev mode (PAIRLY_DEV_AUTH=1) the backend trusts `X-Dev-User-Id`; we send it
 *    so the API works without a real Telegram host.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { mockFetch } from "./mock";
import { getInitData, getDevUserId } from "./twa";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? "true") === "true";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/** Pick the fetch implementation. Mock mode never touches the network. */
const fetchImpl: typeof fetch = USE_MOCK ? (mockFetch as unknown as typeof fetch) : window.fetch.bind(window);

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Resolve the client's IANA timezone for the `X-Client-Timezone` header.
 *
 * Cluster 7(c): the server reads this to render QOTD at the right local
 * time and to ground the date-wheel "smart"/"lucky" prompts in the
 * caller's clock. We guard for hosts that don't expose Intl at all (rare
 * but possible in test sandboxes) — auth must never crash on a missing
 * timezone, so a missing value yields an empty string (the server treats
 * it as "unknown").
 */
function getClientTimezone(): string {
  try {
    if (typeof Intl === "undefined") return "";
    const fmt = Intl.DateTimeFormat();
    const tz = fmt?.resolvedOptions?.().timeZone;
    return typeof tz === "string" ? tz : "";
  } catch {
    return "";
  }
}

/** Build the standard auth header set used by every request. */
function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (USE_MOCK) {
    // Mock never inspects headers; sending initData would also work but isn't useful.
    return headers;
  }
  const initData = getInitData();
  if (initData) {
    headers["X-Telegram-Init-Data"] = initData;
  }
  const devUid = getDevUserId();
  if (devUid) {
    headers["X-Dev-User-Id"] = devUid;
  }
  return headers;
}

/** Low-level request. Adds the auth header (initData in prod, X-Dev-User-Id in dev). */
export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...buildAuthHeaders(),
  };
  // Cluster 7(c): always emit so the server can use it. The server's loose
  // IANA validator (pairly/auth/telegram.py:_coerce_timezone) drops bogus
  // values without failing the request.
  headers["X-Client-Timezone"] = getClientTimezone();

  const res = await fetchImpl(API_URL + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = (j && (j.detail || j.error)) || detail;
    } catch {
      /* keep status text */
    }
    throw new ApiError(res.status, detail);
  }
  // 204 / empty
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Variant of `request` for non-JSON binary payloads (e.g. forwarded
 * Telegram photos). Uses the same auth header path — `X-Telegram-Init-Data`
 * is sent as a HEADER, never a query param, so it never lands in a URL
 * or in Caddy logs.
 *
 * Cluster 7(a): the previous client built `<img src="...?init_data=…">`,
 * which leaks initData via Referer, browser history, and any proxy that
 * logs the request line. We fetch the bytes ourselves with the header,
 * then hand the caller a Blob the UI can wrap in `URL.createObjectURL`.
 */
export async function requestBlob(
  path: string,
  opts: RequestOptions = {},
): Promise<Blob> {
  const headers: Record<string, string> = {
    ...buildAuthHeaders(),
  };
  headers["X-Client-Timezone"] = getClientTimezone();

  const res = await fetchImpl(API_URL + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = (j && (j.detail || j.error)) || detail;
    } catch {
      /* keep status text */
    }
    throw new ApiError(res.status, detail);
  }
  return res.blob();
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers
// ---------------------------------------------------------------------------

import type {
  BucketItem,
  Countdown,
  GiftItem,
  MoodEntry,
  QOTDState,
  WishlistItem,
} from "../types";

export interface MoodResponse {
  self: MoodEntry | null;
  partner: MoodEntry | null;
  partnerName: string | null;
}
export interface GiftsResponse {
  items: GiftItem[];
  partnerName: string | null;
}
export interface QOTDResponse extends QOTDState {
  partnerName: string | null;
}

export interface DateIdeaResponse {
  /** "wishlist" (a real wanted item) or "default" (canned idea). */
  source: string;
  title: string;
  category: string | null;
  /** Warm "why this for you" line. */
  reason: string;
}

export interface LoveNoteItem {
  id: string;
  body: string;
  deliverAt?: string | null;
  /** True if the caller authored it. */
  mine: boolean;
  readByRecipient: boolean;
  createdAt: string;
}

export const endpoints = {
  listWishlist: (signal?: AbortSignal, includeArchived?: boolean) =>
    request<WishlistItem[]>(
      `/api/wishlist${includeArchived ? "?include_archived=1" : ""}`,
      { signal },
    ),
  addWishlist: (b: { title: string; address?: string | null; category?: string | null }, signal?: AbortSignal) =>
    request<WishlistItem>("/api/wishlist", { method: "POST", body: b, signal }),

  /** Spin the date-wheel. category: "eat"|"do"|"stay"|"watch"|"buy"|undefined. */
  getDateIdea: (category?: string, mode?: "random" | "smart" | "lucky", signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (mode) params.set("mode", mode);
    const qs = params.toString();
    return request<DateIdeaResponse>(`/api/date-idea${qs ? `?${qs}` : ""}`, { signal });
  },

  listLoveNotes: (signal?: AbortSignal) =>
    request<LoveNoteItem[]>("/api/love-notes", { signal }),
  sendLoveNote: (b: { body: string; deliverAt?: string | null }, signal?: AbortSignal) =>
    request<LoveNoteItem>("/api/love-notes", { method: "POST", body: b, signal }),
  readLoveNote: (id: string, signal?: AbortSignal) =>
    request<LoveNoteItem>(`/api/love-notes/${id}/read`, { method: "POST", signal }),

  /**
   * Fetch a forwarded photo's bytes with the auth header attached — never
   * via a query-param URL. The server (cluster 5) proxies Telegram file
   * bytes directly so the bot token never enters the response or any log.
   *
   * The caller wraps the returned Blob in `URL.createObjectURL(blob)` and
   * uses it as `<img src>`. On unmount / item change, the URL should be
   * revoked (see `usePhotoBlob` in Wishlist.tsx) to avoid leaks.
   *
   * In mock mode we return a tiny transparent PNG so the UI can still
   * render a placeholder without the network.
   */
  wishlistPhotoBlob: (id: string, signal?: AbortSignal): Promise<Blob> => {
    if (USE_MOCK) {
      // 1x1 transparent PNG — keeps the <img> "loaded" without showing a
      // canned image that would look real.
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      return Promise.resolve(new Blob([png], { type: "image/png" }));
    }
    return requestBlob(`/api/wishlist/${id}/photo`, { signal });
  },
  markDone: (item_id: string, signal?: AbortSignal) =>
    request<WishlistItem>("/api/mark-done", { method: "POST", body: { item_id }, signal }),
  /** Set explicit status. body.status is one of "open"|"planned"|"done"|"archived". */
  setWishlistStatus: (id: string, status: string, signal?: AbortSignal) =>
    request<WishlistItem>(`/api/wishlist/${id}/status`, {
      method: "POST",
      body: { status },
      signal,
    }),
  /** Two-tap consent: partner approves a pending forwarded item. */
  approveWishlist: (id: string, signal?: AbortSignal) =>
    request<WishlistItem>(`/api/wishlist/${id}/approve`, { method: "POST", signal }),
  deleteWishlist: (id: string, signal?: AbortSignal) =>
    request<{ ok: true }>(`/api/wishlist/${id}`, { method: "DELETE", signal }),

  listBucket: (signal?: AbortSignal) => request<BucketItem[]>("/api/bucket", { signal }),
  addBucket: (b: { title: string; note?: string | null; category?: string | null }, signal?: AbortSignal) =>
    request<BucketItem>("/api/bucket", { method: "POST", body: b, signal }),
  setBucketStatus: (id: string, status: string, signal?: AbortSignal) =>
    request<BucketItem>(`/api/bucket/${id}/status`, {
      method: "POST",
      body: { status },
      signal,
    }),
  deleteBucket: (id: string, signal?: AbortSignal) =>
    request<{ ok: true }>(`/api/bucket/${id}`, { method: "DELETE", signal }),

  listCountdowns: (signal?: AbortSignal) => request<Countdown[]>("/api/countdowns", { signal }),
  addCountdown: (b: {
    label: string;
    targetDate: string;
    emoji?: string | null;
    recurrence?: Countdown["recurrence"];
  }, signal?: AbortSignal) => request<Countdown>("/api/countdowns", { method: "POST", body: b, signal }),
  updateCountdown: (
    id: string,
    b: Partial<{
      label: string;
      targetDate: string;
      emoji: string | null;
      recurrence: Countdown["recurrence"];
    }>,
    signal?: AbortSignal,
  ) => request<Countdown>(`/api/countdowns/${id}`, { method: "PATCH", body: b, signal }),
  deleteCountdown: (id: string, signal?: AbortSignal) =>
    request<{ ok: true }>(`/api/countdowns/${id}`, { method: "DELETE", signal }),

  getMood: (signal?: AbortSignal) => request<MoodResponse>("/api/mood", { signal }),
  setMood: (b: { mood: string; note?: string | null }, signal?: AbortSignal) =>
    request<MoodEntry>("/api/mood", { method: "POST", body: b, signal }),
  clearMood: (signal?: AbortSignal) => request<{ ok: boolean }>("/api/mood", { method: "DELETE", signal }),

  getQotd: (signal?: AbortSignal) => request<QOTDResponse>("/api/qotd", { signal }),
  /**
   * Bundle D Task 3: read-only history of past Q&As where BOTH partners
   * answered. The FE history sheet renders rows newest-first, grouped by
   * month. `limit` defaults to 50 on the server; pass a smaller cap to
   * avoid pulling the entire archive on first open.
   */
  getQotdArchive: (signal?: AbortSignal, limit = 50) =>
    request<{
      date: string;
      questionText: string;
      myAnswer: string;
      partnerAnswer: string;
    }[]>(`/api/qotd/archive?limit=${limit}`, { signal }),
  /** Narrower shape: backend's POST /api/qotd/answer returns ONLY
   *  { myAnswer, partnerAnswered, partnerAnswer, newMilestones } — no
   *  `question` field. The caller spreads this into its QOTDResponse. */
  answerQotd: (b: { answer: string }, signal?: AbortSignal) =>
    request<{
      myAnswer: string | null;
      partnerAnswered: boolean;
      partnerAnswer: string | null;
      newMilestones?: { kind: string; value: number }[];
    }>("/api/qotd/answer", { method: "POST", body: b, signal }),

  listGifts: (signal?: AbortSignal) => request<GiftsResponse>("/api/gifts", { signal }),
  sendGift: (b: { gesture: string; description?: string | null }, signal?: AbortSignal) =>
    request<GiftItem>("/api/gifts", { method: "POST", body: b, signal }),
  /** Transition a gift. status is one of "claimed"|"declined"|"redeemed"|"complete"|"archived". */
  actOnGift: (id: string, status: string, signal?: AbortSignal) =>
    request<GiftItem>(`/api/gifts/${id}/transition`, {
      method: "POST",
      body: { status },
      signal,
    }),

  getPairStats: (signal?: AbortSignal) =>
    request<{
      togetherDays: number;
      totalWishlist: number;
      wishlistDone: number;
      totalGifts: number;
      giftsCompleted: number;
      totalQotdAnswers: number;
      totalCountdowns: number;
      createdAt: string | null;
      isPro: boolean;
      newMilestones?: { kind: string; value: number }[];
    }>("/api/pair/stats", { signal }),

  // --- admin (hidden) — 404 unless your TG id is in PAIRLY_ADMIN_TG_IDS ---
  getAdminStatus: (signal?: AbortSignal) =>
    request<{
      pairId: string;
      userId: string;
      tgId: number;
      tier: string | null;
      isPro: boolean;
      adminEnabled: boolean;
    }>("/api/admin/status", { signal }),
  togglePro: (signal?: AbortSignal) =>
    request<{ isPro: boolean }>("/api/admin/toggle-pro", { method: "POST", signal }),
  getAdminStats: (signal?: AbortSignal) =>
    request<{ total: number; pro: number; free: number; dissolved: number }>(
      "/api/admin/stats",
      { signal },
    ),
  listAdminPairs: (limit = 20, offset = 0, signal?: AbortSignal) =>
    request<{ items: AdminPair[] }>(
      `/api/admin/pairs?limit=${limit}&offset=${offset}`,
      { signal },
    ),
  lookupPair: (tg: number, signal?: AbortSignal) =>
    request<AdminPair>(`/api/admin/lookup?tg=${tg}`, { signal }),
  setPairPro: (pairId: string, enable: boolean, signal?: AbortSignal) =>
    request<{ isPro: boolean }>(
      `/api/admin/pairs/${pairId}/pro`,
      { method: enable ? "POST" : "DELETE", signal },
    ),
  getAdminAudit: (limit = 20, signal?: AbortSignal) =>
    request<{ items: AdminAuditEntry[] }>(`/api/admin/audit?limit=${limit}`, { signal }),
};

export type AdminPair = {
  pairId: string;
  tier: string;
  isPro: boolean;
  dissolved: boolean;
  createdAt: string | null;
  members: { tgId: number; name: string | null; username: string | null }[];
};

export type AdminAuditEntry = {
  actorTgId: number;
  action: string;
  targetPairId: string;
  detail: string | null;
  createdAt: string | null;
};

// ---------------------------------------------------------------------------
// useApi hook — loading/error/data with abort-on-unmount.
// ---------------------------------------------------------------------------

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  /** Re-run the fetcher. */
  refetch: () => void;
  /** Replace cached data without refetching (for optimistic updates). */
  setData: (updater: (prev: T | null) => T | null) => void;
}

/**
 * Run `fetcher` on mount and whenever `deps` change. Abortable.
 *
 * The fetcher receives this hook's `AbortSignal` so it can cancel an
 * in-flight request on unmount or when deps change. The `alive` guard below
 * is defense-in-depth: even if a custom fetcher ignores the signal and keeps
 * running, the post-unmount setState calls are dropped.
 *
 * Note: we deliberately do NOT use react-query; the surface is small and the
 * hook stays readable. Add SWR later if we need polling/optimistic cache.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
): UseApiResult<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current(ctrl.signal)
      .then((r) => {
        if (alive) {
          setDataState(r);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        // Aborted fetches intentionally resolve with no state change; the
        // alive guard already prevents post-unmount writes. We match three
        // signals because not every runtime surfaces an abort as a
        // DOMException with name "AbortError":
        //   1. alive === false — the effect's cleanup already ran.
        //   2. The standard AbortError DOMException.
        //   3. Any error that mentions "abort" in name/message (some
        //      fetch shims wrap it as a plain TypeError or generic Error).
        //   4. The controller's signal already aborted (last-resort).
        if (
          !alive ||
          (e instanceof DOMException && e.name === "AbortError") ||
          (typeof e === "object" &&
            e !== null &&
            "name" in e &&
            typeof (e as { name?: unknown }).name === "string" &&
            /abort/i.test((e as { name: string }).name)) ||
          (e instanceof Error && /abort/i.test(e.message)) ||
          ctrl.signal.aborted
        ) {
          return;
        }
        if (alive) {
          setError(e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : "error"));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const setData = useCallback((updater: (prev: T | null) => T | null) => {
    setDataState((prev) => updater(prev));
  }, []);

  return { data, loading, error, refetch, setData };
}

export const IS_MOCK = USE_MOCK;
