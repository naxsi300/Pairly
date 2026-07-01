# Product Alive — MoodCard resonance + DateWheel land-bounce

**Date:** 2026-07-01
**Status:** Approved (self-decided per autonomous directive)
**Scope:** Frontend-only (miniapp). No backend.

## Goal
Two cheap, visible "the product feels alive" polish wins, bundled as one update:
1. **MoodCard resonance** — the harmony connector currently renders identically whether or not the pair is actually in the same mood. Make it light up (solid warm arc + glowing node + bold label) ONLY when both partners have set a mood AND it's the same value. Otherwise: the existing dim dotted arc + muted label.
2. **DateWheel land-bounce** — when the wheel transitions spinning → result, the result card animates in with a small bounce (translateY + scale) instead of a hard swap. Add a haptic on land.

## Decisions (self-resolved)
1. **"Same mood" = identical mood value strings** (e.g. both "хорошо"). Partial/ordinal matching ("both positive-ish") is over-engineered — exact match only, both non-null.
2. **Resonance is visual-only** — no extra notification/haptic on Home (the card itself is ambient). Matches the mood-sync contract ("NEVER alert on mood change").
3. **Bounce target = the result card**, not the wheel. The wheel CSS-spins infinitely and unmounts on result; animating the wheel's stop is fragile. The result card entering with a bounce reads as "the wheel landed."
4. **Haptic on land**: a `twa.haptic("medium")` when phase flips to result. Light, one-shot.

## Design

### MoodCard (`miniapp/src/components/home-cards/MoodCard.tsx`)
- Compute `const inResonance = !!self?.mood && !!partner?.mood && self.mood === partner.mood;` (both set + equal).
- The connector SVG `<path>` + `<circle>` + label switch on `inResonance`:
  - **Resonance**: solid stroke (no dasharray), opacity 1, strokeWidth 2; the node circle gets a soft glow (`filter: drop-shadow(0 0 6px var(--tg-warm))`) + a slow pulse animation; label color warm + bold; add a small "✨" or keep "в резонансе" but brightened.
  - **Not**: current dotted dim arc + muted label (unchanged).
- Add a `@keyframes resonance-pulse` to `index.css` (scale 1→1.2→1 on the node, ~1.6s ease-in-out infinite).
- Keep the card tappable + all data flow unchanged.

### DateWheel (`miniapp/src/components/DateWheel.tsx`)
- On the phase flip to "result" (the existing timer/await that sets phase), call `haptic("medium")` once. (Import `haptic` from `../sdk/twa` if not already.)
- Wrap the result card in a div with class `date-result-bounce`.
- Add to `index.css`:
  ```css
  @keyframes date-result-bounce {
    0% { transform: translateY(8px) scale(0.94); opacity: 0; }
    60% { transform: translateY(-3px) scale(1.02); opacity: 1; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }
  .date-result-bounce { animation: date-result-bounce 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.2) both; }
  ```

### Out of scope
- Wheel-stop deceleration curve (fragile CSS-infinite → keep as-is).
- Sound.
- Mood-resonance notification (forbidden by mood-sync contract anyway).

## Testing
- MoodCard: renders dim dotted arc when moods differ or one missing; renders solid glowing arc + pulse when equal. (Test the conditional class/style; the keyframe is CSS, not asserted beyond presence.)
- DateWheel: result card has `date-result-bounce` class; haptic called on land (mock haptic).

## Success criteria
- A pair both marked "хорошо" sees the MoodCard connector glow + pulse; a pair with different moods sees the calm dotted arc.
- Spinning the wheel → result card pops in with a bounce + a haptic.
- No backend, no behavior regressions, all tests green.
