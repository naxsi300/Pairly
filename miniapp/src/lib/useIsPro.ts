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
