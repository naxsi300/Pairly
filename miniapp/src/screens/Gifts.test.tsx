import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      listGifts: vi.fn().mockResolvedValue({ items: [], partnerName: "Маша" }),
      sendGift: vi.fn(),
    },
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

vi.mock("../lib/milestoneBus", () => ({
  emitMilestone: () => {},
}));

import { Gifts } from "./Gifts";
import { endpoints } from "../sdk/api";

const sendMock = endpoints.sendGift as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendMock.mockReset();
});

/** In the picker, the catalog gesture is rendered as a `<button>` element
 * (clickable grid tile). The same string also appears in the gifts list once
 * the gift is sent. We use role+name to disambiguate the picker button. */
async function openPicker() {
  const addBtn = await screen.findByRole("button", { name: /Добавить/ });
  fireEvent.click(addBtn);
  // Wait until the picker's modal renders — the custom-button toggle appears.
  await screen.findByText(/Свой жест/);
}
async function getCatalogTile() {
  // role=button + text matches the picker grid item, not a list card.
  return screen.findByRole("button", { name: /Завтрак в постель/ });
}

describe("Gifts — cluster 13 modal close race", () => {
  it("modal stays open on send failure (catalog click path)", async () => {
    // The previous code closed the picker synchronously in the click handler
    // BEFORE send() resolved. On failure the user lost their picker with no
    // feedback. New contract: keep picker open on failure.
    sendMock.mockRejectedValue(new Error("network down"));
    render(<Gifts />);
    await openPicker();
    const tile = await getCatalogTile();
    fireEvent.click(tile);

    // Let the in-flight send reject.
    await new Promise((r) => setTimeout(r, 30));

    // The picker must still be open (its custom-gesture toggle is still on screen).
    expect(screen.queryByText(/Свой жест/)).not.toBeNull();
  });

  it("modal closes on successful send (catalog click path)", async () => {
    sendMock.mockResolvedValue({
      id: "g-x",
      gesture: "Завтрак в постель",
      description: "Утром я всё принесу сам(а).",
      status: "received",
      direction: "me",
      createdAt: new Date().toISOString(),
    });
    render(<Gifts />);
    await openPicker();
    const tile = await getCatalogTile();
    fireEvent.click(tile);

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    // After success, the picker should close — the custom-gesture toggle goes away.
    await waitFor(() => expect(screen.queryByText(/Свой жест/)).toBeNull());
  });
});