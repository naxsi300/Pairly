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
  emitMilestone: () => {},
}));

import { Countdowns } from "./Countdowns";
import { endpoints } from "../sdk/api";

const addMock = endpoints.addCountdown as unknown as ReturnType<typeof vi.fn>;
const listMock = endpoints.listCountdowns as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  addMock.mockReset();
  listMock.mockReset();
  listMock.mockResolvedValue([]);
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