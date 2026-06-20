/**
 * Display helpers shared across screens. Pure functions, no React.
 */
import type {
  BucketStatus,
  Countdown,
  GiftStatus,
  WishlistCategory,
  WishlistStatus,
} from "../types";

/** Russian category label for a wishlist category code. */
export function wishlistCategoryLabel(cat?: WishlistCategory | null): string | null {
  if (!cat) return null;
  const map: Record<string, string> = {
    eat: "поесть",
    do: "сделать",
    stay: "переночевать",
    watch: "посмотреть",
    buy: "купить",
  };
  return map[cat] ?? cat;
}

export function wishlistStatusLabel(s: WishlistStatus): string {
  return {
    pending: "ждёт согласия",
    open: "открыто",
    planned: "запланировано",
    done: "сделано",
    archived: "в архиве",
  }[s];
}

export function bucketStatusLabel(s: BucketStatus): string {
  return { dreaming: "мечтаем", planning: "планируем", done: "сбылось" }[s];
}

/** Human label for a gift status (kept neutral, never "rejected"). */
export function giftStatusLabel(s: GiftStatus): string {
  return {
    received: "ждёт",
    claimed: "принят",
    declined: "пропущен",
    redeemed: "выполнен",
    complete: "в добрых делах",
    archived: "в архиве",
  }[s];
}

/**
 * Countdown display per docs/copy/countdowns.md:
 * >48h → "через N дн."; ≤48h → "через N ч"; past → "N дн. назад"; today → "сегодня!".
 */
export function countdownDisplay(c: Countdown, now: Date = new Date()): string {
  const target = new Date(c.targetDate).getTime();
  const diffMs = target - now.getTime();
  const isSameDay =
    now.getFullYear() === new Date(c.targetDate).getFullYear() &&
    now.getMonth() === new Date(c.targetDate).getMonth() &&
    now.getDate() === new Date(c.targetDate).getDate();
  if (isSameDay) return "сегодня!";
  if (diffMs > 0) {
    if (diffMs <= 48 * 3600_000) {
      const hours = Math.max(1, Math.round(diffMs / 3600_000));
      return `через ${hours} ч`;
    }
    const days = Math.round(diffMs / 86_400_000);
    return `через ${days} дн.`;
  }
  const daysAgo = Math.max(1, Math.round(-diffMs / 86_400_000));
  return `${daysAgo} дн. назад`;
}

/** Pluck the emoji prefix or default. */
export function countdownEmoji(c: Countdown): string {
  return c.emoji?.trim() || "📅";
}

/** Format an ISO timestamp as a short ru date (e.g. "5 марта"). */
export function shortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** True if a mood set_at is older than 24h (fade guard per docs/copy/mood-sync.md). */
export function moodIsStale(setAtIso: string, now: Date = new Date()): boolean {
  const t = new Date(setAtIso).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > 24 * 3600_000;
}
