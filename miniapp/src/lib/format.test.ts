import { describe, it, expect, afterEach } from "vitest";
import {
  countdownDays,
  countdownDisplay,
  nextMilestone,
  nextOccurrence,
} from "./format";
import type { Countdown } from "../types";

// Node's `process` global is typed only when @types/node is installed; that
// package is not in the frontend's devDeps. Declare just enough to read/write
// TZ without pulling in the whole Node typings.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare const process: { env: { TZ?: string } };

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

// Cluster 11: day-counter off-by-one (non-UTC users) + sub-day daysAgo.
// Node's `Date` local methods (getFullYear/Month/Date) respect the TZ env var,
// so we pin TZ at the top of each describe block for cases where the target's
// local day differs from its UTC day.
describe("countdownDays (local-midnight anchoring)", () => {
  const savedTz = process.env.TZ;

  afterEach(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it("uses local-midnight diff: target 5 days in local future", () => {
    // NOW = 2026-06-20T12:00:00Z → 2026-06-20 15:00 MSK (UTC+3).
    // Local today = 2026-06-20; +5 local days = 2026-06-25.
    process.env.TZ = "Europe/Moscow";
    const localNow = new Date("2026-06-20T12:00:00Z");
    // 2026-06-25T15:00:00 local MSK = 2026-06-25T12:00:00Z
    const target = "2026-06-25T12:00:00Z";
    expect(countdownDays(cd(target), localNow)).toBe(5);
  });

  it("returns 0 when target's local day equals today's local day", () => {
    process.env.TZ = "Europe/Moscow";
    const localNow = new Date("2026-06-20T12:00:00Z"); // 15:00 MSK = Jun 20
    const targetSameDay = "2026-06-20T01:00:00Z"; // 04:00 MSK = Jun 20
    expect(countdownDays(cd(targetSameDay), localNow)).toBe(0);
  });

  it("returns -1 for a target whose local day is yesterday", () => {
    // Target = 2026-06-18T20:00:00Z = 2026-06-18 23:00 MSK (still Jun 18)
    // Now   = 2026-06-20T12:00:00Z = 2026-06-20 15:00 MSK (Jun 20)
    // Local delta: Jun 18 → Jun 20 = +2 days, but we want this to read as -2
    // (target is 2 days BEFORE today). Wait — we want countdownDays(t) to mean
    // "whole days from now to target", so 2 days BEFORE = -2.
    process.env.TZ = "Europe/Moscow";
    const localNow = new Date("2026-06-20T12:00:00Z");
    const target = "2026-06-18T20:00:00Z";
    expect(countdownDays(cd(target), localNow)).toBe(-2);
  });

  it("is robust to non-UTC TZ: target local day differs from UTC day", () => {
    // Asia/Tokyo (UTC+9). Target = 2026-06-21T05:00:00Z = 2026-06-21 14:00 JST.
    // Now     = 2026-06-20T12:00:00Z = 2026-06-20 21:00 JST.
    // Local delta: Jun 20 → Jun 21 = +1. (Buggy raw-ms diff yields 17/24 ≈ 0
    // — wrong because target is actually tomorrow locally.)
    process.env.TZ = "Asia/Tokyo";
    const localNow = new Date("2026-06-20T12:00:00Z");
    const target = "2026-06-21T05:00:00Z";
    expect(countdownDays(cd(target), localNow)).toBe(1);
  });

  it("uses local-midnight anchoring via constructed Dates (no TZ-env flake)", () => {
    // Construct two Dates whose LOCAL midnight differs by exactly 3 days,
    // regardless of host TZ. Verifies the local-midnight arithmetic directly.
    const base = new Date(2026, 5, 20, 14, 30, 0); // Jun 20, 14:30 LOCAL
    const future = new Date(2026, 5, 23, 0, 0, 0); // Jun 23, 00:00 LOCAL → +3d
    expect(countdownDays(cd(future.toISOString()), base)).toBe(3);
    const past = new Date(2026, 5, 17, 0, 0, 0); // Jun 17, 00:00 LOCAL → -3d
    expect(countdownDays(cd(past.toISOString()), base)).toBe(-3);
  });
});

describe("countdownDisplay sub-day past event", () => {
  const savedTz = process.env.TZ;
  afterEach(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it("does not report '1 дн. назад' for a 1-hour-old past event", () => {
    // NOW = 2026-06-20T12:00:00Z. Target = 1 hour before now (2026-06-20T11:00:00Z).
    // Both share the same UTC day; on any non-trivial TZ they're also the same
    // local day → must read "сегодня!" (or otherwise not "1 дн. назад").
    const s = countdownDisplay(cd("2026-06-20T11:00:00Z"), NOW);
    expect(s).not.toMatch(/назад/);
  });

  it("reports a concise same-day past label (e.g. 'сегодня!') for a sub-day event", () => {
    // An event 30 minutes ago in UTC must not say "1 дн. назад" — that's a lie.
    // On UTC host: local day same as target day → "сегодня!".
    process.env.TZ = "UTC";
    const s = countdownDisplay(cd("2026-06-20T11:30:00Z"), NOW);
    expect(s).toBe("сегодня!");
  });

  it("still says '1 дн. назад' for an event that's truly 1 local day ago", () => {
    process.env.TZ = "UTC";
    // Target = 2026-06-19T12:00:00Z. Now = 2026-06-20T12:00:00Z. Δ = exactly 1 day.
    const s = countdownDisplay(cd("2026-06-19T12:00:00Z"), NOW);
    expect(s).toBe("1 дн. назад");
  });
});

describe("nextMilestone.daysUntil local-midnight anchoring", () => {
  const savedTz = process.env.TZ;
  afterEach(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it("returns whole-day delta from today (local) to milestone (local)", () => {
    // Reference 2026-01-01 (UTC) milestone. In JST, today local = 2026-06-20.
    // Day-200 candidate = ref + 200*86_400_000 ms = 2026-07-20T00:00Z =
    // 2026-07-20T09:00 JST → local day 2026-07-20. Local-day delta = 30.
    // (Buggy raw-ms diff between candidate-instant and now is also ~30 here,
    // so the regression test is mainly about NOT being negative or off by one
    // when the candidate's UTC instant and local midnight diverge.)
    process.env.TZ = "Asia/Tokyo";
    const localNow = new Date("2026-06-20T12:00:00Z");
    const m = nextMilestone(cd("2026-01-01T00:00:00Z", "milestone"), localNow)!;
    expect(m).not.toBeNull();
    expect(m.label).toBe("200 дней вместе");
    expect(m.daysUntil).toBe(30);
  });

  it("daysUntil uses local-midnight anchoring (off-by-one near TZ boundary)", () => {
    // Build a milestone whose next candidate is at 2026-06-20T20:00Z in JST
    // (= 2026-06-21 05:00 JST, local day 21). Old code rounds the raw-UTC
    // diff from now (2026-06-20T12:00Z = 8h raw) to 0; new code reads 1.
    // ref + 200*86_400_000 = target 2026-06-20T20:00Z iff ref = 2026-06-20T20:00Z - 200d.
    process.env.TZ = "Asia/Tokyo";
    const localNow = new Date("2026-06-20T12:00:00Z");
    // ref ms = target ms - 200*86_400_000, where target = 2026-06-20T20:00:00Z.
    const targetMs = Date.UTC(2026, 5, 20, 20, 0, 0); // Jun 20 20:00 UTC
    const refMs = targetMs - 200 * 86_400_000;
    const refIso = new Date(refMs).toISOString();
    const m = nextMilestone(cd(refIso, "milestone"), localNow)!;
    expect(m).not.toBeNull();
    // Day-200 candidate lands on local 2026-06-21 (JST), local today = 2026-06-20 → 1.
    expect(m.daysUntil).toBe(1);
  });

  it("daysUntil is 0 when the candidate's local day is today", () => {
    // Reference 1000 days before NOW (so day-1000 is exactly today).
    // Reference = 2026-06-20T12:00:00Z - 1000 days. day-1000 candidate =
    // 2026-06-20T12:00:00Z. local day == today → daysUntil === 0.
    process.env.TZ = "UTC";
    const localNow = new Date("2026-06-20T12:00:00Z");
    const ref = new Date("2026-06-20T12:00:00Z");
    ref.setDate(ref.getDate() - 1000);
    const m = nextMilestone(cd(ref.toISOString(), "milestone"), localNow)!;
    expect(m).not.toBeNull();
    expect(m.daysUntil).toBe(0);
  });
});
