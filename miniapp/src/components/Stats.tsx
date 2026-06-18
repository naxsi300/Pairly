/** Ambient shared-counters card — warm stats, not a dashboard. Renders at the top
 * of the app when data is available. Uses PairStats from the API.
 */
import { useCallback, useEffect, useState } from "react";
import { COPY } from "../copy";
import { endpoints } from "../sdk/api";

interface StatsData {
  togetherDays: number;
  totalWishlist: number;
  wishlistDone: number;
  totalGifts: number;
  giftsCompleted: number;
  totalQotdAnswers: number;
  totalCountdowns: number;
}

export function StatsCard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await endpoints.getPairStats();
      setStats({
        togetherDays: data.togetherDays,
        totalWishlist: data.totalWishlist,
        wishlistDone: data.wishlistDone,
        totalGifts: data.totalGifts,
        giftsCompleted: data.giftsCompleted,
        totalQotdAnswers: data.totalQotdAnswers,
        totalCountdowns: data.totalCountdowns,
      });
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error || !stats) return null;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 animate-fade-in">
      <div className="card-m3 px-3 py-2 text-center text-xs text-tg-hint">
        <span className="font-medium text-tg-text">
          {COPY.stats.days(stats.togetherDays)}
        </span>
        {stats.totalWishlist > 0
          ? ` · ${COPY.stats.wishlist(stats.totalWishlist, stats.wishlistDone)}`
          : null}
        {stats.totalGifts > 0
          ? ` · ${COPY.stats.gifts(stats.totalGifts, stats.giftsCompleted)}`
          : null}
        {stats.totalQotdAnswers > 0
          ? ` · ${COPY.stats.qotd(stats.totalQotdAnswers)}`
          : null}
      </div>
    </div>
  );
}
