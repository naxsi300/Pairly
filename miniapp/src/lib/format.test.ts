import { describe, it, expect } from "vitest";
import { countdownDisplay, nextMilestone, nextOccurrence } from "./format";
import type { Countdown } from "../types";

const NOW = new Date("2026-06-20T12:00:00Z");
function cd(targetDate: string, recurrence: Countdown["recurrence"] = null): Countdown {
  return { id: "x", label: "L", targetDate, recurrence };
}

describe("nextOccurrence (roll-forward)", () => {
  it("returns null for one-shot (null) and milestone countdowns", () => {
    expect(nextOccurrence(cd("2024-03-01", null), NOW)).toBeNull();
    expect(nextOccurrence(cd("2024-03-01", "milestone"), NOW)).toBeNull();
  });

  it("rolls an annual countdown forward to the next future occurrence", () => {
    // 2024-03-01 is past at NOW (2026-06-20): next is 2027-03-01.
    const occ = nextOccurrence(cd("2024-03-01", "annual"), NOW)!;
    expect(occ.getTime()).toBeGreaterThan(NOW.getTime());
    expect(occ.getFullYear()).toBe(2027);
    expect(occ.getMonth()).toBe(2); // March (0-indexed)
    expect(occ.getDate()).toBe(1);
  });

  it("leaves an already-future annual countdown untouched", () => {
    const occ = nextOccurrence(cd("2027-03-01", "annual"), NOW)!;
    expect(occ.toISOString()).toBe(new Date("2027-03-01").toISOString());
  });

  it("rolls a monthly countdown forward month by month", () => {
    // 2026-04-15 monthly: May 15 (past), Jun 15 (past), Jul 15 (future).
    const occ = nextOccurrence(cd("2026-04-15", "monthly"), NOW)!;
    expect(occ.getTime()).toBeGreaterThan(NOW.getTime());
    expect(occ.getMonth()).toBe(6); // July
    expect(occ.getDate()).toBe(15);
  });

  it("clamps a Feb 29 annual reference to Feb 28 on non-leap years", () => {
    // 2024-02-29 annual: 2025-02-28, 2026-02-28 (past), 2027-02-28 (future) — never Mar 1.
    const occ = nextOccurrence(cd("2024-02-29", "annual"), NOW)!;
    expect(occ.getMonth()).toBe(1); // February
    expect(occ.getDate()).toBe(28);
    expect(occ.getFullYear()).toBe(2027);
  });

  it("clamps month-end monthly recurrence (Jan 31 → Feb 28)", () => {
    // 2026-01-31 monthly at NOW (Jun 20): Feb 28, Mar 31, Apr 30, May 31, Jun 30 (future).
    const occ = nextOccurrence(cd("2026-01-31", "monthly"), NOW)!;
    expect(occ.getMonth()).toBe(5); // June
    expect(occ.getDate()).toBe(30);
  });
});

describe("countdownDisplay rolls recurring countdowns forward", () => {
  it("shows 'через N дн.' for a passed annual, not 'N дн. назад'", () => {
    const s = countdownDisplay(cd("2024-03-01", "annual"), NOW);
    expect(s.startsWith("через")).toBe(true);
    expect(s.includes("назад")).toBe(false);
  });

  it("shows 'N дн. назад' for a passed one-shot countdown", () => {
    const s = countdownDisplay(cd("2024-03-01", null), NOW);
    expect(s.includes("назад")).toBe(true);
  });
});

describe("nextMilestone (Feb 29 reference)", () => {
  it("clamps yearly milestones to Feb 28, not Mar 1, on non-leap years", () => {
    // Reference 1992-02-29 (leap), 34 years before NOW. All day-milestones
    // (≤10000d ≈ 27yr) have passed, so the next milestone is a YEAR one:
    // 35 years → 2027, where Feb 29 doesn't exist, so it must clamp to Feb 28
    // (the raw Date constructor would overflow to Mar 1).
    const m = nextMilestone(cd("1992-02-29", "milestone"), NOW)!;
    expect(m).not.toBeNull();
    expect(m.date.getFullYear()).toBe(2027);
    expect(m.date.getMonth()).toBe(1); // February
    expect(m.date.getDate()).toBe(28); // clamped, not Mar 1
  });
});
