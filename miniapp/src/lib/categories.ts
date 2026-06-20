/**
 * Canonical date/wishlist categories — shared by the date-wheel, the wishlist
 * add-modal, and card emojis. Legacy codes (do/buy) are kept in the map so old
 * rows still render, even though the pickers offer the newer, date-oriented set.
 */
export const CATEGORIES: { id: string; emoji: string; label: string }[] = [
  { id: "eat", emoji: "🍽", label: "Еда" },
  { id: "walk", emoji: "🚶", label: "Прогулка" },
  { id: "active", emoji: "🚴", label: "Активно" },
  { id: "watch", emoji: "🎬", label: "Кино/театр" },
  { id: "culture", emoji: "🖼", label: "Культура" },
  { id: "relax", emoji: "🧖", label: "Расслабиться" },
  { id: "stay", emoji: "🛌", label: "Дома" },
  { id: "trip", emoji: "🚆", label: "Поездка" },
];

const MAP: Record<string, { emoji: string; label: string }> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, { emoji: c.emoji, label: c.label }]),
);
// Legacy codes from older items (kept selectable-neutral, still render).
MAP["do"] = { emoji: "🎲", label: "Активность" };
MAP["buy"] = { emoji: "🛍", label: "Покупки" };

/** Emoji for a category code (canonical, legacy, or fallback pin). */
export function categoryEmoji(id?: string | null): string {
  return (id && MAP[id]?.emoji) || "📌";
}

/** Human label for a category code, or null if unknown. */
export function categoryLabel(id?: string | null): string | null {
  if (!id) return null;
  return MAP[id]?.label ?? null;
}
