# Bundle F — Settings / Profile screen

**Date:** 2026-07-02
**Status:** Approved (self-decided)
**Scope:** Frontend (new screen) + 1 backend endpoint (display_name update).

## Problem
There's NO user-facing settings/profile screen. A user can't set how their partner sees them (display name shows as tg_username fallback otherwise), can't see pair info (together-since), and the only way to unpair is the bot. The app has a hidden admin menu but nothing for ordinary users to manage themselves.

## Decisions (self-resolved)
1. **Settings screen** accessible from Home (a small ⚙️ in the Home header, or a MoreSheet entry). Sections:
   - **You**: display name (editable, save → PATCH /api/me), your tg handle (read-only).
   - **Pair**: "Вместе с {partner} с {date}" (read-only, from pair stats), partner's name.
   - **Danger**: "Расстворить пару" (unpair) → confirm modal → calls the existing bot /unpair flow (or a new mini-app endpoint that mirrors it). If the unpair path is bot-only and complex, show "через бота: /unpair" with a copy button instead of a half-wired button.
2. **Backend**: `PATCH /api/me` accepting `{display_name?: string}` (validate length 1-128, grapheme-truncate using existing helper). Membership not needed (it's the caller's own row). Update `User.display_name`.
3. **No language toggle** (Russian-only for now; out of scope).
4. **No avatar upload** (out of scope; display name is the main identity lever).
5. **Pair info** comes from existing `/api/pair/stats` (createdAt, togetherDays) + the partner name (already surfaced). No new endpoint for that.

## Out of scope
- Avatar/photo upload.
- Language selector.
- Notification preferences (would need backend notification settings).
- Account deletion beyond unpair.

## Design

### Backend
- `PATCH /api/me` in app.py: body `{display_name?: str}`. Validate (non-empty after trim, ≤128 chars, grapheme-cap via `truncate_graphemes`). Update caller's `User.display_name`. Return `MeOut {id, displayName, tgUsername}`. Add to schemas.
- New `GET /api/me` (or fold into stats) — simplest: `GET /api/me` returns the caller's profile (display_name, tg_username, pair createdAt, partner display_name). Reuse existing helpers.

### Frontend
- New screen `Settings.tsx` (warm ScreenHeader ⚙️). Renders the three sections.
- Display-name: a text field + "Сохранить" button → PATCH /api/me. Optimistic + refetch.
- Pair section: read from `usePairStatus` data (createdAt, partnerName) — may need the partner name; if not in stats, derive.
- Unpair: confirm modal → either call a new endpoint OR show the bot instruction.
- Entry: add a ⚙️ button to Home's ScreenHeader area (or a MoreSheet "Настройки" item).

### copy.ts
- `settings.heading:"Настройки"`, `settings.youSection:"Вы"`, `settings.displayNameLabel:"Как вас видеть"`, `settings.displayNamePlaceholder:"Ваше имя"`, `settings.save:"Сохранить"`, `settings.saved:"Сохранено"`, `settings.pairSection:"Пара"`, `settings.togetherSince:(date)=>"Вместе с {date}"`, `settings.unpairSection:"Опасная зона"`, `settings.unpairButton:"Расстворить пару"`, `settings.unpairConfirm:(name)=>"Точно расстворить пару с {name}? Это нельзя отменить."`, `settings.unpairSubmit:"Расстворить"`.

## Testing
- Backend: PATCH /api/me updates display_name; validates length; ignores empty.
- Frontend: Settings renders; save calls PATCH; saved toast; unpair confirm flow.

## Success criteria
- A user can set their display name → partner sees it (Mood/QOTD/Gifts already read display_name).
- Pair info visible.
- Unpair reachable from the app (even if it delegates to bot).
