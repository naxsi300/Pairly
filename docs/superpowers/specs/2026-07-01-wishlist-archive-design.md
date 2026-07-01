# Wishlist Archive — Design

**Date:** 2026-07-01
**Status:** Approved (self-decided per autonomous directive)
**Scope:** Frontend (miniapp) + one small backend query-param. No migration (ARCHIVED status already exists).

## Problem
The free-tier wishlist limit (10) is the single most-felt friction. Today a user hitting the limit must either go Pro or **hard-delete** an item — deletion is terminal and feels like the app is "squeezing" them. The backend already supports an `ARCHIVED` status (terminal soft-state, excluded from the cap and the default list), but the UI never exposes it. This bundle surfaces archive as a **free, non-FOMO** path: tuck done/stale items away without losing them.

## Decisions (self-resolved, recorded)
1. **Archive is one-way (soft delete), no restore.** The backend contract says `ARCHIVED` is terminal (no transition out). Rather than weaken that invariant, "archive" = a one-way tuck-away. Restoring would mean recreating (out of scope). This matches the ideation intent ("soft auto-archive") and avoids a messy half-state.
2. **Archive is available from OPEN / PLANNED / DONE** (matches backend `ALLOWED`). PENDING items must be approved first (no archive of a not-yet-consented forward).
3. **A separate "Архив" section** at the bottom of the Wishlist screen (collapsed by default), not a tab switch — keeps the main list calm. Shows archived items dimmed, read-only (no actions), each with a note "в архиве".
4. **Auto-archive is NOT included** (the ideation mentioned 30-day auto-archive, but automatic deletion of user content is surprising — out of scope; archive is user-initiated only).
5. **Cap messaging update**: the limit-hit copy already offers "убрать что-то старое"; we now also surface "архивировать" as the gentle option right where the action is (on each item), and the limit modal (Bundle C will replace alert()) will mention it.

## Design

### Backend (small)
- `GET /api/wishlist` gains an optional `?include_archived=1` query param. When set, the handler calls `wishlist.list_items(..., include_archived=True)`. Default unchanged (archived excluded). The frontend's main list filters archived out client-side too (already does: `status !== "archived"`), and the archive section filters to `status === "archived"`.
- `set_status` already accepts `WishlistStatus.ARCHIVED` for OPEN/PLANNED/DONE. No repo change. The frontend's `setWishlistStatus(id, "archived")` works today.

### Frontend
- **Archive action**: each OPEN/PLANNED/DONE item's action row gets a small `📦 В архив` ghost button (alongside existing Сбылось/Повторить/Удалить). Confirm via the existing delete-confirm Modal pattern (reuse: a small `<Modal>` "Убрать «{title}» в архив? Останется в архиве, но не будет мешаться." with «В архив»/«Отмена»). On confirm → `endpoints.setWishlistStatus(id, "archived")` + optimistic move to the archive section.
- **Archive section**: below the main list, a disclosure ("Архив · N" → tap to expand). The Wishlist list call now always fetches `?include_archived=1` (cheap — one extra column) so both the main list (client-filtered to non-archived) and the archive section (client-filtered to archived) derive from the same `data`. Render archived items dimmed, read-only. No actions (one-way).
- **Copy** (`copy.ts`): add `wishlist.archiveAction: "В архив"`, `wishlist.archiveConfirm: (title) => "Убрать «{title}» в архив? Останется в архиве, но не будет мешаться."`, `wishlist.archiveSubmit: "В архив"`, `wishlist.archivedLabel: "в архиве"`, `wishlist.archiveSectionClosed: (n) => "Архив · {n}"`, `wishlist.archiveSectionOpen: "Архив"`, `wishlist.archiveEmpty: "В архиве пусто."`.

### Out of scope
- Auto-archive (user-initiated only).
- Restore from archive (one-way).
- Backend migration (none needed).

## Testing
- Repo: `list_items(include_archived=True)` includes archived (already true — add/extend test if not covered).
- API: `GET /api/wishlist?include_archived=1` returns archived items.
- Frontend: archive action only on OPEN/PLANNED/DONE (not PENDING); confirm modal; optimistic move; archive section renders archived items read-only; empty archive state.

## Success criteria
- A user over the limit can archive an OPEN/DONE item → it leaves the main list → the cap counts it as freed → the archived item is visible (read-only) in the Архив section.
- No data loss (archive is reversible only via re-creation, but the item is never deleted).
- No FOMO: archive is presented as a normal organize action, not a paywall pressure point.
