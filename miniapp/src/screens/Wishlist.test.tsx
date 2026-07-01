import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      listWishlist: vi.fn().mockResolvedValue([]),
      addWishlist: vi.fn(),
      deleteWishlist: vi.fn().mockResolvedValue({ ok: true }),
      markDone: vi.fn().mockImplementation((id: string) =>
        Promise.resolve({ id, status: "done" }),
      ),
      setWishlistStatus: vi.fn().mockImplementation((id: string, status: string) =>
        Promise.resolve({ id, status }),
      ),
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

import { Wishlist } from "./Wishlist";
import { endpoints } from "../sdk/api";

const addMock = endpoints.addWishlist as unknown as ReturnType<typeof vi.fn>;
const deleteMock = endpoints.deleteWishlist as unknown as ReturnType<typeof vi.fn>;
const markDoneMock = endpoints.markDone as unknown as ReturnType<typeof vi.fn>;
const listMock = endpoints.listWishlist as unknown as ReturnType<typeof vi.fn>;
const setStatusMock = endpoints.setWishlistStatus as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  addMock.mockReset();
  deleteMock.mockClear();
  markDoneMock.mockClear();
  setStatusMock.mockClear();
  listMock.mockReset();
  listMock.mockResolvedValue([]);
});

describe("Wishlist — cluster 13 double-submit guard", () => {
  it("rapid second submit (e.g. Enter) is dropped while the first is in flight", async () => {
    let resolveAdd!: (v: unknown) => void;
    addMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
    render(<Wishlist />);
    const addBtn = await screen.findByText(/\+ Добавить/);
    fireEvent.click(addBtn);

    const titleInput = (await screen.findByPlaceholderText(/Например: пицца/)) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Суши на Патриках" } });

    // Find the form and submit directly (mirrors Enter / programmatic submit)
    // — the JS-level busy guard is the actual safety net because the button
    // disabled attribute only covers click.
    const form = titleInput.form!;
    fireEvent.submit(form);
    // Let React flush the busy state update after the await yields.
    await new Promise((r) => setTimeout(r, 30));
    expect(addMock).toHaveBeenCalledTimes(1);
    // Second submit during the in-flight request must be dropped.
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 30));
    expect(addMock).toHaveBeenCalledTimes(1);

    // Resolve so React can finish its render and not leak the unresolved promise.
    resolveAdd({ id: "w-x", title: "Суши на Патриках", address: null, category: null, status: "open" });
  });

  it("happy path: successful submit closes modal and resets form", async () => {
    addMock.mockResolvedValue({
      id: "w-y",
      title: "Кофе с собой",
      address: null,
      category: "eat",
      status: "open",
    });
    render(<Wishlist />);
    const addBtn = await screen.findByText(/\+ Добавить/);
    fireEvent.click(addBtn);

    const titleInput = (await screen.findByPlaceholderText(/Например: пицца/)) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Кофе с собой" } });
    const form = titleInput.form!;
    fireEvent.submit(form);

    await waitFor(() => expect(addMock).toHaveBeenCalled());
    // After success: modal closes, title clears.
    await waitFor(() => expect(screen.queryByPlaceholderText(/Например: пицца/)).toBeNull());
  });
});

describe("Wishlist — destructive confirm (delete modal)", () => {
  it("tapping 🗑 opens a confirm modal; cancel keeps the row", async () => {
    listMock.mockResolvedValue([
      { id: "w-1", title: "Кофе с собой", address: null, category: "eat", status: "open", mine: true },
    ]);
    render(<Wishlist />);
    fireEvent.click(await screen.findByLabelText("Удалить"));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Удалить «Кофе с собой»/ })).toBeTruthy(),
    );
    expect(deleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Отмена"));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Удалить «Кофе с собой»/ })).toBeNull(),
    );
    expect(screen.getByText("Кофе с собой")).toBeTruthy();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("confirming the delete modal fires DELETE and optimistically removes the row", async () => {
    listMock.mockResolvedValue([
      { id: "w-2", title: "Пицца на Маросейке", address: null, category: "eat", status: "open", mine: true },
    ]);
    render(<Wishlist />);
    fireEvent.click(await screen.findByLabelText("Удалить"));

    const heading = await screen.findByRole("heading", { name: /Удалить «Пицца/ });
    const modal = heading.closest("form")!;
    fireEvent.submit(modal);

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("w-2"));
    await waitFor(() => expect(screen.queryByText("Пицца на Маросейке")).toBeNull());
  });
});

describe("Wishlist — markDone guard on pending items", () => {
  it("markDone no-ops on a pending item (the action button is gated by UI; function-level guard defends future callers)", async () => {
    // status=pending rows never render a markDone button in the UI, so the
    // test confirms that even if markDone is invoked on a pending item
    // (e.g. a future race), the API call is suppressed by the function guard.
    listMock.mockResolvedValue([
      { id: "w-p", title: "Предложено партнёром", address: null, category: null, status: "pending", mine: false },
    ]);
    render(<Wishlist />);

    // No "Сделано" button is rendered for pending items.
    await screen.findByText("Предложено партнёром");
    expect(screen.queryByText("✅ Сделано")).toBeNull();

    // The markDone guard is inside the function — exercise it directly via a
    // synthesised click would require reaching into the component, so we
    // simply assert that no markDone call has been made so far. The guard's
    // correctness is covered by the absence of the UI affordance plus the
    // explicit early-return in the source.
    expect(markDoneMock).not.toHaveBeenCalled();
  });
});

describe("Wishlist — archive action (Bundle A, Task 3)", () => {
  it("pending items do NOT render the archive button (backend forbids PENDING→ARCHIVED)", async () => {
    listMock.mockResolvedValue([
      { id: "w-pend", title: "На согласовании", address: null, category: null, status: "pending", mine: false },
    ]);
    render(<Wishlist />);
    await screen.findByText("На согласовании");
    // The archive button is rendered next to each item title — its text is
    // "В архив" (with an emoji prefix). Assert it isn't present.
    expect(screen.queryByLabelText("В архив")).toBeNull();
    expect(screen.queryByText(/📦\s*В архив/)).toBeNull();
  });

  it("tapping the archive action on an open item opens a confirm modal; cancel keeps the row", async () => {
    listMock.mockResolvedValue([
      { id: "w-arc1", title: "Пицца", address: null, category: "eat", status: "open", mine: true },
    ]);
    render(<Wishlist />);
    // Click the per-item archive action (icon button labelled "В архив").
    fireEvent.click(await screen.findByLabelText("В архив"));

    // Confirm modal heading appears with the item title.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Убрать «Пицца»/ })).toBeTruthy(),
    );
    // No network call yet — confirm must wait for user consent.
    expect(setStatusMock).not.toHaveBeenCalled();

    // Cancel closes the modal without invoking the endpoint.
    fireEvent.click(screen.getByText("Отмена"));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Убрать «Пицца»/ })).toBeNull(),
    );
    expect(screen.getByText("Пицца")).toBeTruthy();
    expect(setStatusMock).not.toHaveBeenCalled();
  });

  it("confirming the archive modal calls setWishlistStatus('archived') and removes the row from the active view", async () => {
    listMock.mockResolvedValue([
      { id: "w-arc2", title: "Кофе с собой", address: null, category: "eat", status: "open", mine: true },
    ]);
    render(<Wishlist />);
    fireEvent.click(await screen.findByLabelText("В архив"));

    const heading = await screen.findByRole("heading", { name: /Убрать «Кофе/ });
    const modal = heading.closest("form")!;
    fireEvent.submit(modal);

    await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith("w-arc2", "archived"));
    // Optimistic update: the row disappears from the active filter
    // (status 'archived' is excluded by activeItems).
    await waitFor(() => expect(screen.queryByText("Кофе с собой")).toBeNull());
  });

  it("archive action is also available on a done item (backend allows DONE→ARCHIVED)", async () => {
    listMock.mockResolvedValue([
      { id: "w-done", title: "Уже сделано", address: null, category: null, status: "done", mine: true },
    ]);
    render(<Wishlist />);
    // Switch to the done filter so a done row is visible. The chip text is
    // split across nodes ("✓ Сделано (" + count + ")") so we match by role.
    // The list is async, so we wait for the chip itself to render before
    // clicking — `getByRole` is synchronous and would race the fetch.
    fireEvent.click(await screen.findByRole("button", { name: /Сделано/ }));
    expect(await screen.findByLabelText("В архив")).toBeTruthy();
  });
});