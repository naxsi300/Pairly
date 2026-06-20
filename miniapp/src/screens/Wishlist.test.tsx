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

beforeEach(() => {
  addMock.mockReset();
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