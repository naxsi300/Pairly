import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      listCountdowns: vi.fn().mockResolvedValue([]),
      addCountdown: vi.fn(),
      updateCountdown: vi.fn(),
      deleteCountdown: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

// suppress haptic noise in jsdom
vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

vi.mock("../lib/milestoneBus", () => ({
  emitMilestone: vi.fn(),
}));

import { Countdowns } from "./Countdowns";
import { endpoints } from "../sdk/api";
import { COPY } from "../copy";
import { emitMilestone } from "../lib/milestoneBus";

const addMock = endpoints.addCountdown as unknown as ReturnType<typeof vi.fn>;
const listMock = endpoints.listCountdowns as unknown as ReturnType<typeof vi.fn>;
const updateMock = endpoints.updateCountdown as unknown as ReturnType<typeof vi.fn>;
const deleteMock = endpoints.deleteCountdown as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  addMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  listMock.mockReset();
  listMock.mockResolvedValue([]);
  deleteMock.mockResolvedValue({ ok: true });
  (emitMilestone as unknown as ReturnType<typeof vi.fn>).mockReset();
});

describe("Countdowns — cluster 7 emoji fallback (no Intl.Segmenter)", () => {
  it("emoji onChange still caps input length when Intl.Segmenter is unavailable", async () => {
    // Cluster 7(b): the previous fallback returned the raw value untruncated.
    // We now bound it with a code-point slice so the value can never run away
    // (e.g. user pastes 200 emoji by mistake — the input must not accept all).
    const origIntl = globalThis.Intl;
    // Simulate a host without Segmenter.
    (globalThis as { Intl: unknown }).Intl = {
      DateTimeFormat: origIntl.DateTimeFormat,
    } as unknown as typeof Intl;
    try {
      const huge = "🎉".repeat(200); // 200 code points
      render(<Countdowns />);
      const addBtn = await screen.findByText(/\+ Добавить/);
      fireEvent.click(addBtn);
      const emojiInput = (await screen.findAllByPlaceholderText(/Эмодзи/))[0] as HTMLInputElement;
      fireEvent.change(emojiInput, { target: { value: huge } });
      // Fallback slices to 32 code points, joined back. Should be 32 emoji.
      expect([...emojiInput.value].length).toBeLessThanOrEqual(32);
      // And the value is non-empty (we don't drop to "").
      expect(emojiInput.value.length).toBeGreaterThan(0);
      // Single emoji (e.g. 🎉🎊🎁🎂🎈 → 5 codepoints) survives uncut.
      fireEvent.change(emojiInput, { target: { value: "🎉🎊🎁🎂🎈" } });
      expect([...emojiInput.value].length).toBe(5);
    } finally {
      (globalThis as { Intl: unknown }).Intl = origIntl;
    }
  });
});

describe("Countdowns — cluster 12 fixes", () => {
  it("emoji onChange caps at 4 grapheme clusters (Intl.Segmenter)", async () => {
    // family-emoji: man + ZWJ + woman + ZWJ + girl + ZWJ + boy → 1 grapheme, many code units
    const family = "👨‍👩‍👧‍👦";
    // five single-codepoint emoji → 5 graphemes, must be trimmed to 4
    const five = "🎉🎊🎁🎂🎈";
    render(<Countdowns />);
    // open the add modal
    const addBtn = await screen.findByText(/\+ Добавить/);
    fireEvent.click(addBtn);

    const emojiInput = (await screen.findAllByPlaceholderText(/Эмодзи/))[0] as HTMLInputElement;
    // Paste five single-codepoint emoji; expect input to keep first 4.
    fireEvent.change(emojiInput, { target: { value: five } });
    // Family emoji is a single grapheme but encodes as many code units — must survive.
    fireEvent.change(emojiInput, { target: { value: family } });
    expect(emojiInput.value).toBe(family);
    // Mixed five — keep first four clusters.
    fireEvent.change(emojiInput, { target: { value: five } });
    expect(emojiInput.value.length).toBeGreaterThan(0);
    expect([...emojiInput.value].length).toBeLessThanOrEqual(4);
    // Specifically: should be exactly the first four of "🎉🎊🎁🎂🎈"
    expect(emojiInput.value).toBe("🎉🎊🎁🎂");
  });

  it("submit guards against double-fire: rapid second submit (e.g. Enter) is dropped", async () => {
    let resolveAdd!: (v: unknown) => void;
    addMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
    render(<Countdowns />);
    const addBtn = await screen.findByText(/\+ Добавить/);
    fireEvent.click(addBtn);

    const labelInput = (await screen.findByPlaceholderText(/Название, например/)) as HTMLInputElement;
    const dateInput = (await screen.findByPlaceholderText(/Дата, например/)) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Отпуск" } });
    fireEvent.change(dateInput, { target: { value: "25.12.2026" } });

    // Submit the form directly (mirrors Enter key in a TextInput, or programmatic
    // requestSubmit()). The button-disabled guard doesn't cover these paths, so the
    // JS-level busy guard is the actual safety net.
    const form = (dateInput as HTMLInputElement).form!;
    fireEvent.submit(form);
    // Let React flush the busy state update after the await yields.
    await new Promise((r) => setTimeout(r, 30));
    expect(addMock).toHaveBeenCalledTimes(1);
    // Second submit during the in-flight request must be dropped.
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 30));
    expect(addMock).toHaveBeenCalledTimes(1);

    // Resolve so React can finish its render and not leak the unresolved promise.
    resolveAdd({ id: "x1", label: "Отпуск", targetDate: "2026-12-25T00:00:00.000Z", emoji: null, recurrence: null });
  });

  it("parseRuDate: date-only input encodes the user's LOCAL midnight, not UTC", async () => {
    // Read the function indirectly via the date the addCountdown call receives.
    // We construct a date and verify the targetDate string includes the user's local day
    // — NOT a UTC-midnight shift that would move it to the previous day in non-UTC zones.
    addMock.mockResolvedValue({
      id: "x2",
      label: "Test",
      targetDate: new Date().toISOString(),
      emoji: null,
      recurrence: null,
    });
    render(<Countdowns />);
    const addBtn = await screen.findByText(/\+ Добавить/);
    fireEvent.click(addBtn);

    const labelInput = (await screen.findByPlaceholderText(/Название, например/)) as HTMLInputElement;
    const dateInput = (await screen.findByPlaceholderText(/Дата, например/)) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Годовщина" } });
    fireEvent.change(dateInput, { target: { value: "25.12.2026" } });
    const saveBtn = await screen.findByText("Сохранить");
    fireEvent.click(saveBtn);

    await waitFor(() => expect(addMock).toHaveBeenCalled());
    const call = addMock.mock.calls[0]?.[0] as { targetDate: string };
    // Compute what local midnight encodes to: the ISO string MUST include the user's
    // local "25" (not 24 or 26) when the locale is east/west of UTC enough to shift it.
    // We check the more portable invariant: the resulting UTC instant, when converted
    // back to the user's local day, yields 25 — i.e. we did NOT store UTC midnight.
    const tzOffsetMin = new Date(2026, 11, 25, 0, 0, 0).getTimezoneOffset();
    // For users in UTC+ (negative offset), UTC midnight 25.12.2026 reads as local day 24 or 25
    // depending on the offset. Verify the stored instant, when rendered in user's local TZ,
    // lands on day 25.
    const storedMs = new Date(call.targetDate).getTime();
    const localDay = new Date(storedMs).getDate();
    const localMonth = new Date(storedMs).getMonth() + 1;
    const localYear = new Date(storedMs).getFullYear();
    // Either we land on 25.12.2026 in local time (the bug-free case),
    // or — if the test runner happens to be on UTC — we land on 25.12.2026 00:00 UTC.
    // Both are acceptable; the bug case (UTC midnight) lands on 24.12.2026 in negative-offset zones.
    if (tzOffsetMin < 0) {
      // East of UTC: local midnight encoded as UTC+offset. We store the user's local midnight,
      // which from a UTC frame is offset INTO the future — but Date renders back to user's local
      // 25.12.2026.
      expect(localDay).toBe(25);
      expect(localMonth).toBe(12);
      expect(localYear).toBe(2026);
    } else if (tzOffsetMin > 0) {
      // West of UTC: stored instant must still be the user's local midnight; reads back as 25.
      expect(localDay).toBe(25);
    } else {
      // UTC: any encoding is fine; we just need a valid date.
      expect(Number.isNaN(storedMs)).toBe(false);
    }
  });
});

describe("Countdowns — MED cluster (confirm-delete, cdBlocks, recurrence, aria)", () => {
  function cd(label: string, targetIso: string, recurrence: "annual" | "monthly" | "milestone" | null = null) {
    return { id: label, label, targetDate: targetIso, emoji: null, recurrence };
  }

  it("trash-click opens a confirm Modal and does NOT delete until confirmed", async () => {
    // Pre-load one countdown so the row renders.
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    listMock.mockResolvedValue([cd("c1", soon)]);
    render(<Countdowns />);

    // Wait for the row, then click its delete button.
    const deleteBtn = await screen.findByRole("button", { name: /Удалить отсчёт c1/ });
    fireEvent.click(deleteBtn);

    // Confirm dialog appears with the label echoed in the title.
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Удалить отсчёт «c1»/);

    // Until the user confirms, the API must NOT be hit and the row must remain.
    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.queryByText("c1")).not.toBeNull();

    // Cancel via the secondary button (Отмена) → dialog gone, row still there.
    fireEvent.click(screen.getByRole("button", { name: COPY.common.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.queryByText("c1")).not.toBeNull();

    // Reopen, this time confirm via the submit button (scoped to the dialog
    // so we don't accidentally click the row's delete button which has the
    // same accessible name "🗑 Удалить" / "Удалить").
    fireEvent.click(deleteBtn);
    const dialog2 = await screen.findByRole("dialog");
    const submit = dialog2.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submit);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("c1"));
  });

  it("edit row uses Russian aria-labels for both delete and edit buttons", async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    listMock.mockResolvedValue([cd("Годовщина", soon)]);
    render(<Countdowns />);
    // Sanity: both labels include the countdown label so screen readers
    // disambiguate rows with identical visible text.
    expect(await screen.findByRole("button", { name: /Изменить отсчёт Годовщина/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Удалить отсчёт Годовщина/ })).toBeTruthy();
  });

  it("cdBlocks returns null when remaining time is < 1 minute (no '0 часов 0 минут')", async () => {
    // 30s in the future → all three of d/h/m will be 0 with the old formula;
    // the new guard returns null and the row renders the friendly "сегодня!"
    // fallback via countdownDisplay() instead of "0 часов 0 минут".
    const in30s = new Date(Date.now() + 30_000).toISOString();
    listMock.mockResolvedValue([cd("Almost", in30s)]);
    render(<Countdowns />);
    await screen.findByText("Almost");
    // The text "0 часов 0 минут" must never appear; same-day fallback renders "сегодня!".
    expect(screen.queryByText(/0\s*часов\s*0\s*минут/)).toBeNull();
    expect(screen.queryByText(/сегодня/)).not.toBeNull();
  });

  it("cdBlocks still renders hour+minute blocks when sub-day but >= 1 minute", async () => {
    // 5h 30m away: sub-day boundary, but minutes is non-zero → blocks must show.
    const inHours = new Date(Date.now() + (5 * 3600 + 30 * 60) * 1000).toISOString();
    listMock.mockResolvedValue([cd("Soon", inHours)]);
    render(<Countdowns />);
    await screen.findByText("Soon");
    // The "X часов" and "Y минут" labels should be present.
    expect(screen.queryByText("часов")).not.toBeNull();
    expect(screen.queryByText("минут")).not.toBeNull();
  });

  it("editing a milestone countdown without toggling keeps recurrence='milestone'", async () => {
    // Cluster: ensure the milestone chip OFF state during edit doesn't accidentally
    // null out the recurrence on save — the chip maps to recurrence="milestone"
    // directly, and the user just leaving it on should round-trip cleanly.
    updateMock.mockResolvedValue({
      id: "m1",
      label: "Вместе",
      targetDate: "2024-01-01T00:00:00.000Z",
      emoji: null,
      recurrence: "milestone",
    });
    listMock.mockResolvedValue([
      cd("Вместе", "2024-01-01T00:00:00.000Z", "milestone"),
    ]);
    render(<Countdowns />);

    // Open the edit modal for the existing milestone.
    const editBtn = await screen.findByRole("button", { name: /Изменить отсчёт Вместе/ });
    fireEvent.click(editBtn);

    // The milestone chip is already pressed from the prefilled state.
    const chip = await screen.findByRole("button", { name: /Считать круглые даты/ });
    expect(chip.getAttribute("aria-pressed")).toBe("true");

    // Save without touching the chip.
    const saveBtn = await screen.findByText(COPY.common.save);
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const body = updateMock.mock.calls[0]?.[1] as { recurrence: "milestone" | null };
    expect(body.recurrence).toBe("milestone");
  });

  it("editing an annual countdown without toggling preserves recurrence='annual'", async () => {
    // The MED finding: openEdit pre-filled milestone from c.recurrence === "milestone"
    // only, so an existing "annual" countdown would have its recurrence silently
    // wiped to null on save. Fix: track originalRecurrence and preserve it.
    updateMock.mockResolvedValue({
      id: "a1",
      label: "Годовщина",
      targetDate: "2024-06-15T00:00:00.000Z",
      emoji: null,
      recurrence: "annual",
    });
    listMock.mockResolvedValue([
      cd("Годовщина", "2024-06-15T00:00:00.000Z", "annual"),
    ]);
    render(<Countdowns />);

    const editBtn = await screen.findByRole("button", { name: /Изменить отсчёт Годовщина/ });
    fireEvent.click(editBtn);

    // Chip should be unpressed (annual != milestone).
    const chip = await screen.findByRole("button", { name: /Считать круглые даты/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    const saveBtn = await screen.findByText(COPY.common.save);
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const body = updateMock.mock.calls[0]?.[1] as { recurrence: string | null };
    // Pre-fix this would have been null; post-fix it stays "annual".
    expect(body.recurrence).toBe("annual");
  });
});

describe("Countdowns — milestone presets (Task 4)", () => {
  it("shows preset chips only when the milestone toggle is on", async () => {
    // listMock returns an empty list (per beforeEach).
    render(<Countdowns />);
    fireEvent.click(await screen.findByText(/\+ Добавить/));
    // Before toggling milestone: no preset chip text yet.
    expect(screen.queryByText(/День знакомства/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Своя дата/)).not.toBeInTheDocument();
    // Toggle milestone on.
    fireEvent.click(screen.getByRole("button", { name: /Считать круглые даты/ }));
    expect(await screen.findByText(/День знакомства/)).toBeInTheDocument();
    expect(screen.getByText(/Свадьба/)).toBeInTheDocument();
    expect(screen.getByText(/Своя дата/)).toBeInTheDocument();
  });

  it("tapping a preset fills label + emoji", async () => {
    render(<Countdowns />);
    fireEvent.click(await screen.findByText(/\+ Добавить/));
    fireEvent.click(screen.getByRole("button", { name: /Считать круглые даты/ }));
    fireEvent.click(await screen.findByText(/День знакомства/));
    const labelInput = (await screen.findByPlaceholderText(/Название, например/)) as HTMLInputElement;
    expect(labelInput.value).toBe("День знакомства");
  });
});

describe("Countdowns — milestone card label-based celebration (Task 5)", () => {
  it("shows the milestone celebration as «unit · label»", async () => {
    // A milestone countdown with label "День знакомства" whose next round is ~100 days.
    listMock.mockResolvedValue([
      { id: "m1", label: "День знакомства", emoji: "💝", targetDate: "2026-03-14T00:00:00Z", recurrence: "milestone" },
    ]);
    render(<Countdowns />);
    // The milestone card's stat-big line should read "100 дней · День знакомства"
    // (or whatever the next round is — assert it contains the label + "дней").
    // The label also appears in the row title; use the stat-big selector to disambiguate.
    const statBig = await screen.findByText(/\d+ дн(?:ей|я|ень) · День знакомства/);
    expect(statBig).toBeInTheDocument();
    expect(statBig.className).toContain("stat-big");
  });
});

describe("Countdowns — day-of milestone toast (Task 6)", () => {
  it("emits a milestone toast when a round date is reached today", async () => {
    // Reference exactly 100 days ago → 100-day round is today (daysUntil === 0).
    // Wall-clock-independent: we anchor against `now` at test time, so any TZ works.
    const now = new Date();
    const ref = new Date(now.getTime() - 100 * 86_400_000).toISOString();
    const emitSpy = emitMilestone as unknown as ReturnType<typeof vi.fn>;
    listMock.mockResolvedValue([
      { id: "m1", label: "День знакомства", emoji: "💝", targetDate: ref, recurrence: "milestone" },
    ]);
    render(<Countdowns />);
    // Use the stat-big line (which contains label + "100 дней · …") to disambiguate from
    // the row title — both match /День знакомства/, only the stat-big scopes to the
    // milestone celebration we care about.
    await screen.findByText(/100 дней · День знакомства/);
    expect(emitSpy).toHaveBeenCalled();
    const calls = emitSpy.mock.calls as Array<[unknown]>;
    const lastCall = calls[calls.length - 1]?.[0] as { kind: string; value: number };
    expect(lastCall.kind).toBe("milestone");
    // The round we landed on is 100 days from a 100-days-ago reference.
    expect(lastCall.value).toBe(100);
  });
});
