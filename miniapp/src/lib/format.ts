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
 * Recurring (annual/monthly) countdowns roll forward to their next occurrence,
 * so a passed anniversary shows "через N дн." to the next one, not "N дн. назад".
 */
export function countdownDisplay(c: Countdown, now: Date = new Date()): string {
  const occ = nextOccurrence(c, now);
  const targetDate = occ ?? new Date(c.targetDate);
  const target = targetDate.getTime();
  const diffMs = target - now.getTime();
  const isSameDay =
    now.getFullYear() === targetDate.getFullYear() &&
    now.getMonth() === targetDate.getMonth() &&
    now.getDate() === targetDate.getDate();
  if (isSameDay) return "сегодня!";
  if (diffMs > 0) {
    if (diffMs <= 48 * 3600_000) {
      const hours = Math.max(1, Math.round(diffMs / 3600_000));
      return `через ${hours} ч`;
    }
    // Use the TZ-safe local-midnight delta for the rolled-forward occurrence
    // (or the raw target for one-shot / milestone countdowns).
    const days = localDayDelta(targetDate, now);
    return `через ${days} дн.`;
  }
  // Past event. Count whole LOCAL days elapsed so "1 дн. назад" actually
  // means "yesterday" — a sub-day event is already caught by isSameDay
  // (same local day → "сегодня!"). The Math.max(1, ...) floor is gone so a
  // just-passed event doesn't lie about being "1 day ago".
  const daysAgo = localDayDelta(targetDate, now);
  if (daysAgo === 0) return "сегодня!";
  return `${-daysAgo} дн. назад`;
}

/** Pluck the emoji prefix or default. */
export function countdownEmoji(c: Countdown): string {
  return c.emoji?.trim() || "📅";
}

/** Whole-day delta between two instants, anchored to LOCAL midnight on both
 * ends so the result is robust to the creator's vs. viewer's TZ: a target
 * whose local day is "tomorrow" reads as +1 even when its UTC instant would
 * otherwise round to 0 or -1 against now. Pure helper — no React. */
function localDayDelta(target: Date, now: Date): number {
  const t = Number.isNaN(target.getTime()) ? now : target;
  const targetStart = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = Math.round(
    (targetStart.getTime() - nowStart.getTime()) / 86_400_000,
  );
  // Avoid -0 leaking out (Object.is semantics trip on negative zero).
  return delta === 0 ? 0 : delta;
}

/** Whole-day delta from now to a countdown's target (negative = past). */
export function countdownDays(c: Countdown, now: Date = new Date()): number {
  return localDayDelta(new Date(c.targetDate), now);
}

/** Russian pluralization for years: 1 год / 2–4 года / 5+ лет. */
function ruYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} год`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} года`;
  return `${n} лет`;
}

/** Add N months to a date, clamping the day to month-end on overflow (e.g.
 * Jan 31 + 1 month → Feb 28/29; Feb 29 + 12 months on a non-leap year → Feb 28).
 * The JS Date constructor would otherwise silently spill into the next month. */
function addMonths(d: Date, months: number): Date {
  const res = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  if (res.getDate() !== d.getDate()) {
    // day rolled over → last day of the target month
    return new Date(d.getFullYear(), d.getMonth() + months + 1, 0);
  }
  return res;
}

/** Add N years (12 months each), with the same month-end clamping. */
function addYears(d: Date, years: number): Date {
  return addMonths(d, years * 12);
}

/**
 * For a recurring countdown (recurrence "annual"/"monthly"), the EFFECTIVE
 * target is the next occurrence on/after today — computed at read time, without
 * mutating the stored date (so the original is preserved and there's no race).
 * Returns null for one-shot (null) and milestone countdowns; callers then use
 * the raw target / nextMilestone() respectively. Iterations are capped as a guard.
 */
export function nextOccurrence(c: Countdown, now: Date = new Date()): Date | null {
  if (c.recurrence !== "annual" && c.recurrence !== "monthly") return null;
  const base = new Date(c.targetDate);
  if (Number.isNaN(base.getTime())) return null;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Add the step to the ORIGINAL base each iteration (not the rolled date) so a
  // month-end date like Jan 31 doesn't stick: Jan 31 → Feb 28 → Mar 31 → Apr 30…
  const stepMonths = c.recurrence === "annual" ? 12 : 1;
  let n = 0;
  let d = base;
  let guard = 0;
  while (d.getTime() < todayStart.getTime() && guard < 600) {
    n += 1;
    d = addMonths(base, n * stepMonths);
    guard++;
  }
  return d;
}

// Round "together" day-count milestones generated from a reference date.
const DAY_MILESTONES = [
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000, 3000, 5000, 10000,
];

/**
 * For a "milestone" countdown (recurrence === "milestone"), target_date is a
 * reference point (e.g. дата знакомства). Returns the next upcoming round date —
 * a 100/…/1000-day or yearly anniversary — as a synthetic occasion, or null.
 */
export function nextMilestone(
  c: Countdown,
  now: Date = new Date(),
): { date: Date; daysUntil: number; label: string } | null {
  const ref = new Date(c.targetDate);
  if (Number.isNaN(ref.getTime())) return null;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates: { date: Date; label: string }[] = [];
  for (const d of DAY_MILESTONES) {
    candidates.push({ date: new Date(ref.getTime() + d * 86_400_000), label: `${d} дней вместе` });
  }
  for (let y = 1; y <= 100; y++) {
    candidates.push({
      date: addYears(ref, y),
      label: `${ruYears(y)} вместе`,
    });
  }
  const first = candidates
    .filter((cand) => cand.date.getTime() >= todayStart.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  if (!first) return null;
  return {
    date: first.date,
    // Local-midnight anchoring: today's local day vs the candidate's local
    // day, not raw ms between candidate-instant and now. Matches how the
    // candidate filter (>= todayStart) is also expressed in local terms.
    daysUntil: Math.max(0, localDayDelta(first.date, now)),
    label: first.label,
  };
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
