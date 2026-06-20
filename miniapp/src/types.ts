/**
 * Shared domain types for the Mini App.
 * Shapes mirror the backend models (pairly/db/models.py) and the FastAPI contract
 * (pairly/api/app.py). Field names match the JSON the API returns.
 */

export type ID = string;

/** Wishlist category labels (docs/copy/wishlist.md). */
export type WishlistCategory =
  | "eat"
  | "do"
  | "stay"
  | "watch"
  | "buy"
  | string;

export type WishlistStatus = "pending" | "open" | "planned" | "done" | "archived";

export interface WishlistItem {
  id: ID;
  title: string;
  address?: string | null;
  category?: WishlistCategory | null;
  /** ISO date string if a date was parsed at forward time. */
  eventDate?: string | null;
  notes?: string | null;
  status: WishlistStatus;
  /** Deep link to the original forwarded Telegram post (https://t.me/...). */
  sourceUrl?: string | null;
  /** True when the caller authored this item (two-tap: only partner approves). */
  mine?: boolean;
  /** True when a forwarded photo's file_id was captured (resolved on demand). */
  hasPhoto?: boolean;
}

export type BucketStatus = "dreaming" | "planning" | "done";

export interface BucketItem {
  id: ID;
  title: string;
  note?: string | null;
  category?: string | null;
  status: BucketStatus;
  completedAt?: string | null;
}

export type CountdownRecurrence = "annual" | "monthly" | null;

export interface Countdown {
  id: ID;
  label: string;
  emoji?: string | null;
  /** ISO timestamp of the target instant (creator's TZ resolved). */
  targetDate: string;
  recurrence: CountdownRecurrence;
}

export type MoodValue = "сияю" | "хорошо" | "ровно" | "так себе" | "паршиво";

export interface MoodEntry {
  mood: MoodValue;
  note?: string | null;
  /** ISO timestamp of when the mood was set. */
  setAt: string;
}

export type GiftStatus =
  | "received"
  | "claimed"
  | "declined"
  | "redeemed"
  | "complete"
  | "archived";

export interface GiftItem {
  id: ID;
  gesture: string;
  description?: string | null;
  status: GiftStatus;
  /** "me" = current viewer is the giver; "them" = partner is the giver. */
  direction: "me" | "them";
  createdAt: string;
}

export interface QOTDQuestion {
  id: ID;
  text: string;
  category: string;
}

export interface QOTDState {
  question: QOTDQuestion | null;
  /** Has the current viewer answered today? */
  myAnswer: string | null;
  /** Has the partner answered today? Partner's body is HIDDEN until myAnswer set. */
  partnerAnswered: boolean;
  /** Present only when reveal gate has passed (myAnswer non-null AND partner answered). */
  partnerAnswer: string | null;
}

/** Free-tier limits shown warmly when hit (per pair). */
export interface Limits {
  wishlist: number;
  countdown: number;
  bucket: number;
}

export const DEFAULT_LIMITS: Limits = {
  wishlist: 10,
  countdown: 10,
  bucket: 5,
};
