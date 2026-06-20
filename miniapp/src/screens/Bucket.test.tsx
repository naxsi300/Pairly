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
    },
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

import { Bucket } from "./Bucket";
import { endpoints } from "../sdk/api";

const addMock = endpoints.addBucket as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  addMock.mockReset();
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