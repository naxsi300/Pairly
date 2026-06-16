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
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** Low-level request. Adds the auth header (initData in prod, X-Dev-User-Id in dev). */
export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (USE_MOCK) {
    // Mock never inspects headers; sending initData would also work but isn't useful.
  } else {
    const initData = getInitData();
    if (initData) {
      headers["X-Telegram-Init-Data"] = initData;
    }
    const devUid = getDevUserId();
    if (devUid) {
      headers["X-Dev-User-Id"] = devUid;
    }
  }

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
  partnerName: string;
}
export interface GiftsResponse {
  items: GiftItem[];
  partnerName: string;
}
export interface QOTDResponse extends QOTDState {
  partnerName: string;
}

export const endpoints = {
  listWishlist: () => request<WishlistItem[]>("/api/wishlist"),
  addWishlist: (b: { title: string; address?: string | null; category?: string | null }) =>
    request<WishlistItem>("/api/wishlist", { method: "POST", body: b }),
  markDone: (item_id: string) =>
    request<WishlistItem>("/api/mark-done", { method: "POST", body: { item_id } }),
  deleteWishlist: (id: string) => request<{ ok: true }>(`/api/wishlist/${id}`, { method: "DELETE" }),

  listBucket: () => request<BucketItem[]>("/api/bucket"),
  addBucket: (b: { title: string; note?: string | null; category?: string | null }) =>
    request<BucketItem>("/api/bucket", { method: "POST", body: b }),
  deleteBucket: (id: string) => request<{ ok: true }>(`/api/bucket/${id}`, { method: "DELETE" }),

  listCountdowns: () => request<Countdown[]>("/api/countdowns"),
  addCountdown: (b: {
    label: string;
    targetDate: string;
    emoji?: string | null;
    recurrence?: Countdown["recurrence"];
  }) => request<Countdown>("/api/countdown", { method: "POST", body: b }),
  deleteCountdown: (id: string) =>
    request<{ ok: true }>(`/api/countdown/${id}`, { method: "DELETE" }),

  getMood: () => request<MoodResponse>("/api/mood"),
  setMood: (b: { mood: string; note?: string | null }) =>
    request<MoodEntry>("/api/mood", { method: "POST", body: b }),

  getQotd: () => request<QOTDResponse>("/api/qotd"),
  answerQotd: (b: { answer: string }) =>
    request<QOTDState>("/api/qotd/answer", { method: "POST", body: b }),

  listGifts: () => request<GiftsResponse>("/api/gifts"),
  sendGift: (b: { gesture: string; description?: string | null }) =>
    request<GiftItem>("/api/gift", { method: "POST", body: b }),
  actOnGift: (id: string, action: "accept" | "decline" | "redeem" | "complete") =>
    request<GiftItem>(`/api/gift/${id}/${action}`, { method: "POST", body: {} }),
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
 * Note: we deliberately do NOT use react-query; the surface is small and the
 * hook stays readable. Add SWR later if we need polling/optimistic cache.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseApiResult<T> {
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
      .current()
      .then((r) => {
        if (alive) {
          setDataState(r);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
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
