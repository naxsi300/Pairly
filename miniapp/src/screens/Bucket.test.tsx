import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      listBucket: vi.fn().mockResolvedValue([]),
      addBucket: vi.fn(),
      deleteBucket: vi.fn().mockResolvedValue({ ok: true }),
      setBucketStatus: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

vi.mock("../lib/milestoneBus", () => ({
  emitMilestone: vi.fn(),
}));

import { Bucket } from "./Bucket";
import { endpoints } from "../sdk/api";
import { emitMilestone } from "../lib/milestoneBus";

const addMock = endpoints.addBucket as unknown as ReturnType<typeof vi.fn>;
const deleteMock = endpoints.deleteBucket as unknown as ReturnType<typeof vi.fn>;
const listMock = endpoints.listBucket as unknown as ReturnType<typeof vi.fn>;
const setStatusMock = endpoints.setBucketStatus as unknown as ReturnType<typeof vi.fn>;
const emitMock = emitMilestone as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  addMock.mockReset();
  deleteMock.mockClear();
  listMock.mockReset();
  listMock.mockResolvedValue([]);
  setStatusMock.mockReset();
  setStatusMock.mockResolvedValue({ ok: true });
  emitMock.mockReset();
});

describe("Bucket — cluster 13 double-submit guard", () => {
  it("rapid second submit (e.g. Enter) is dropped while the first is in flight", async () => {
    let resolveAdd!: (v: unknown) => void;
    addMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
    render(<Bucket />);
    const addBtn = await screen.findByText(/\+ Добавить/);
    fireEvent.click(addBtn);

    const titleInput = (await screen.findByPlaceholderText(/Например: увидеть/)) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Увидеть северное сияние" } });

    const form = titleInput.form!;
    fireEvent.submit(form);
    // Let React flush the busy state update after the await yields.
    await new Promise((r) => setTimeout(r, 30));
    expect(addMock).toHaveBeenCalledTimes(1);
    // Second submit during the in-flight request must be dropped.
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 30));
    expect(addMock).toHaveBeenCalledTimes(1);

    resolveAdd({ id: "b-x", title: "Увидеть северное сияние", note: null, category: null, status: "dreaming" });
  });

  it("happy path: successful submit closes modal and resets form", async () => {
    addMock.mockResolvedValue({
      id: "b-y",
      title: "Съездить на океан",
      note: null,
      category: null,
      status: "dreaming",
    });
    render(<Bucket />);
    const addBtn = await screen.findByText(/\+ Добавить/);
    fireEvent.click(addBtn);

    const titleInput = (await screen.findByPlaceholderText(/Например: увидеть/)) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Съездить на океан" } });
    const form = titleInput.form!;
    fireEvent.submit(form);

    await waitFor(() => expect(addMock).toHaveBeenCalled());
    // After success: modal closes, title clears.
    await waitFor(() => expect(screen.queryByPlaceholderText(/Например: увидеть/)).toBeNull());
  });
});

describe("Bucket — destructive confirm (delete modal)", () => {
  it("tapping 🗑 opens a confirm modal and only commits delete on confirm", async () => {
    listMock.mockResolvedValue([
      { id: "b-1", title: "Увидеть северное сияние", note: null, category: null, status: "dreaming" },
    ]);
    render(<Bucket />);
    fireEvent.click(await screen.findByText("🗑 Удалить"));

    // Confirm modal appears with the title in the heading.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Удалить мечту/ })).toBeTruthy(),
    );
    // The row is still in the list (delete is gated, not optimistic until confirm).
    expect(screen.getByText("Увидеть северное сияние")).toBeTruthy();
    // No DELETE fired yet.
    expect(deleteMock).not.toHaveBeenCalled();

    // Cancel — the modal disappears, the row stays, no delete fired.
    fireEvent.click(screen.getByText("Отмена"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Удалить мечту/ })).toBeNull());
    expect(screen.getByText("Увидеть северное сияние")).toBeTruthy();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("confirming the delete modal triggers optimistic remove + DELETE call", async () => {
    listMock.mockResolvedValue([
      { id: "b-2", title: "Съездить на океан", note: null, category: null, status: "dreaming" },
    ]);
    render(<Bucket />);
    fireEvent.click(await screen.findByText("🗑 Удалить"));

    const heading = await screen.findByRole("heading", { name: /Удалить мечту/ });
    const modal = heading.closest("form")!;
    fireEvent.submit(modal);

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("b-2"));
    // Row optimistically removed.
    await waitFor(() => expect(screen.queryByText("Съездить на океан")).toBeNull());
  });
});

describe("Bucket — soft error on action failure", () => {
  it("surfaces an inline error when markDone() PATCH fails", async () => {
    listMock.mockResolvedValue([
      {
        id: "b-3",
        title: "Полёт на воздушном шаре",
        note: null,
        category: null,
        status: "dreaming",
      },
    ]);
    setStatusMock.mockRejectedValueOnce(new Error("network"));
    render(<Bucket />);

    fireEvent.click(await screen.findByText(/Сбылось 🌌/));

    // Optimistic update flips the row to "done" (status label shows in meta).
    await waitFor(() =>
      expect(screen.getAllByText(/сбылось/).length).toBeGreaterThan(0),
    );
    // Inline error toast appears once the PATCH rejects.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Не отправилось|Попробуйте/i),
    );
    // PATCH was attempted exactly once.
    expect(setStatusMock).toHaveBeenCalledWith("b-3", "done");
  });

  it("clears the inline error when a subsequent action succeeds", async () => {
    listMock.mockResolvedValue([
      {
        id: "b-4",
        title: "Прыжок с парашютом",
        note: null,
        category: null,
        status: "dreaming",
      },
    ]);
    setStatusMock
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true });
    render(<Bucket />);

    // First attempt: fails -> alert appears. markDone rolls back (item stays
    // dreaming) so the "Сбылось" button is still the affordance.
    fireEvent.click(await screen.findByText(/Сбылось 🌌/));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    // Recovery: tap "Сбылось" again — this time setBucketStatus resolves, the
    // alert clears, and the item flips to done.
    fireEvent.click(await screen.findByText(/Сбылось 🌌/));
    await waitFor(() => expect(setStatusMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("Bucket — fulfilled-dreams gallery (Bundle D Task 1)", () => {
  it("renders a segmented toggle below the header with both tabs", async () => {
    listMock.mockResolvedValue([
      { id: "b-1", title: "Увидеть северное сияние", note: null, category: null, status: "dreaming" },
      { id: "b-2", title: "Съездить на океан", note: null, category: null, status: "done", completedAt: "2026-06-01T10:00:00.000Z" },
    ]);
    render(<Bucket />);
    // Both tabs present, active tab carries .chip.active.
    const dreamsTab = await screen.findByRole("button", { name: /^Мечты$/ });
    const fulfilledTab = await screen.findByRole("button", { name: /Сбылось 🌠/ });
    expect(dreamsTab.className).toContain("chip");
    expect(dreamsTab.className).toContain("active");
    expect(fulfilledTab.className).toContain("chip");
    expect(fulfilledTab.className).not.toContain("active");
  });

  it("fulfilled tab shows done items newest-first with 'сбылось {date}' label", async () => {
    listMock.mockResolvedValue([
      { id: "b-1", title: "Полёт на воздушном шаре", note: null, category: null, status: "dreaming" },
      {
        id: "b-2",
        title: "Увидеть северное сияние",
        note: null,
        category: null,
        status: "done",
        completedAt: "2026-03-15T10:00:00.000Z",
      },
      {
        id: "b-3",
        title: "Прыжок с парашютом",
        note: null,
        category: null,
        status: "done",
        completedAt: "2026-05-20T10:00:00.000Z",
      },
    ]);
    render(<Bucket />);

    // Dreams tab: dreaming item visible, no "сбылось {date}" labels yet.
    await screen.findByText("Полёт на воздушном шаре");
    expect(screen.queryByText(/^сбылось \d/)).toBeNull();

    // Switch to fulfilled tab (shooting-star emoji distinguishes it from the
    // per-row "Сбылось 🌌" action button).
    const fulfilledTab = await screen.findByRole("button", { name: /Сбылось 🌠/ });
    fireEvent.click(fulfilledTab);

    // Dreaming item gone, done items rendered newest-first with label.
    await waitFor(() => expect(screen.queryByText("Полёт на воздушном шаре")).toBeNull());
    const labels = screen.getAllByText(/^сбылось /);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    // Newest (May) should appear before older (March) in document order.
    const all = document.body.textContent ?? "";
    const mayIdx = all.indexOf("Прыжок с парашютом");
    const marIdx = all.indexOf("Увидеть северное сияние");
    expect(mayIdx).toBeGreaterThanOrEqual(0);
    expect(marIdx).toBeGreaterThan(mayIdx);
    // Active class swapped to fulfilled tab.
    expect(screen.getByRole("button", { name: /Сбылось 🌠/ }).className).toContain("active");
  });

  it("fulfilled tab empty state shows the warm empty copy when no done items", async () => {
    listMock.mockResolvedValue([
      { id: "b-1", title: "Полёт на воздушном шаре", note: null, category: null, status: "dreaming" },
    ]);
    render(<Bucket />);
    const fulfilledTab = await screen.findByRole("button", { name: /Сбылось 🌠/ });
    fireEvent.click(fulfilledTab);
    expect(
      await screen.findByText(/Пока ничего не сбылось — но всё впереди/),
    ).toBeTruthy();
    // Dreaming item is hidden in the fulfilled view.
    expect(screen.queryByText("Полёт на воздушном шаре")).toBeNull();
  });
});

describe("Bucket — dream-fulfilled ceremony (Bundle E Task 1)", () => {
  it("emits bucket_done_count=1 after the first dream is marked done", async () => {
    listMock.mockResolvedValue([
      {
        id: "b-1",
        title: "Увидеть северное сияние",
        note: null,
        category: null,
        status: "dreaming",
      },
    ]);
    render(<Bucket />);
    fireEvent.click(await screen.findByText(/Сбылось 🌌/));

    await waitFor(() =>
      expect(emitMock).toHaveBeenCalledWith({ kind: "bucket_done_count", value: 1 }),
    );
    // Exactly one emit per successful markDone.
    const calls = emitMock.mock.calls.filter(
      ([arg]) => (arg as { kind: string }).kind === "bucket_done_count",
    );
    expect(calls.length).toBe(1);
  });

  it("emits bucket_done_count=N where N reflects the post-flip done count", async () => {
    // Two already done + one dreaming → mark the third done → doneCount=3.
    listMock.mockResolvedValue([
      { id: "b-1", title: "Готово 1", note: null, category: null, status: "done", completedAt: "2026-01-01T00:00:00.000Z" },
      { id: "b-2", title: "Готово 2", note: null, category: null, status: "done", completedAt: "2026-02-01T00:00:00.000Z" },
      { id: "b-3", title: "Полёт на воздушном шаре", note: null, category: null, status: "dreaming" },
    ]);
    render(<Bucket />);
    fireEvent.click(await screen.findByText(/Сбылось 🌌/));

    await waitFor(() =>
      expect(emitMock).toHaveBeenCalledWith({ kind: "bucket_done_count", value: 3 }),
    );
  });

  it("does NOT emit a milestone when markDone() PATCH fails", async () => {
    listMock.mockResolvedValue([
      {
        id: "b-1",
        title: "Прыжок с парашютом",
        note: null,
        category: null,
        status: "dreaming",
      },
    ]);
    setStatusMock.mockRejectedValueOnce(new Error("network"));
    render(<Bucket />);

    fireEvent.click(await screen.findByText(/Сбылось 🌌/));
    // Wait for the inline error to appear so we know the catch path ran.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Не отправилось|Попробуйте/i),
    );
    const bucketCalls = emitMock.mock.calls.filter(
      ([arg]) => (arg as { kind: string }).kind === "bucket_done_count",
    );
    expect(bucketCalls.length).toBe(0);
  });
});