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
    },
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

import { Bucket } from "./Bucket";
import { endpoints } from "../sdk/api";

const addMock = endpoints.addBucket as unknown as ReturnType<typeof vi.fn>;
const deleteMock = endpoints.deleteBucket as unknown as ReturnType<typeof vi.fn>;
const listMock = endpoints.listBucket as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  addMock.mockReset();
  deleteMock.mockClear();
  listMock.mockReset();
  listMock.mockResolvedValue([]);
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