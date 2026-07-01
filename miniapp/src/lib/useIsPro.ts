import { endpoints, useApi } from "../sdk/api";

/** Shared Pro-status of the current pair (from /api/pair/stats). Used by the date
 * wheel (mode gating) and the hidden admin menu (Pro toggle). */
export function useIsPro() {
  const { data, refetch, setData } = useApi(endpoints.getPairStats);
  const isPro = !!data?.isPro;
  /** Optimistically flip the cached value, then refetch to confirm against the server. */
  function setPro(next: boolean) {
    setData((prev) => (prev ? { ...prev, isPro: next } : prev));
    refetch();
  }
  return { isPro, refresh: refetch, setPro };
}

/** Shared pair-status (from /api/pair/stats). Extends `useIsPro` with `hasPair`:
 *  true when the request resolved with data (paired user), false while loading
 *  or after a 412 ("pair up first"). The Mini App treats an unpaired user as
 *  the "show the invite-partner banner" state. */
export function usePairStatus() {
  const { data, loading, error, refetch, setData } = useApi(endpoints.getPairStats);
  const isPro = !!data?.isPro;
  // Backend maps "no pair for this user" to 412. Once `data` resolves, the
  // request succeeded → the user IS in a pair, regardless of free/Pro.
  // During the first paint `loading=true && error=null && data=null` → we
  // treat that as "still unknown, don't flash the banner yet"; consumers
  // gate on `!hasPair && !loading`.
  const hasPair = !error && data != null;
  function setPro(next: boolean) {
    setData((prev) => (prev ? { ...prev, isPro: next } : prev));
    refetch();
  }
  return { isPro, hasPair, loading, refresh: refetch, setPro };
}