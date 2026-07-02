import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      listGifts: vi.fn().mockResolvedValue({
        items: [
          {
            id: "g-w",
            gesture: "Массаж",
            description: "15 минут",
            status: "received",
            direction: "them",
            createdAt: new Date().toISOString(),
          },
        ],
        partnerName: "Маша",
      }),
      sendGift: vi.fn(),
      actOnGift: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

vi.mock("../lib/milestoneBus", () => ({
  emitMilestone: vi.fn(),
}));

import { Gifts } from "./Gifts";
import { endpoints } from "../sdk/api";
import { emitMilestone } from "../lib/milestoneBus";

const sendMock = endpoints.sendGift as unknown as ReturnType<typeof vi.fn>;
const actMock = endpoints.actOnGift as unknown as ReturnType<typeof vi.fn>;
const emitMock = emitMilestone as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendMock.mockReset();
  actMock.mockReset();
  actMock.mockResolvedValue({ ok: true });
  emitMock.mockReset();
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

describe("Gifts — action-first hero", () => {
  it("renders a waiting gift in the hero with an accept button", async () => {
    render(<Gifts />);
    const hero = await screen.findByTestId("gifts-waiting-hero");
    // The "Ждёт вас" label lives inside the hero.
    expect(hero.textContent).toMatch(/Ждёт вас/);
    // The gesture is rendered as "🎁 Массаж" inside the hero.
    expect(hero.textContent).toMatch(/Массаж/);
    // The Принять button is the warm (primary) action in the hero.
    const heroAccept = screen
      .getAllByRole("button", { name: /Принять/ })
      .find((b) => b.closest('[data-testid="gifts-waiting-hero"]'));
    expect(heroAccept).toBeTruthy();
  });
});

describe("Gifts — Bundle E: accepted-gift toast (gift_received)", () => {
  it("emits gift_received milestone when accept succeeds", async () => {
    render(<Gifts />);
    await screen.findByTestId("gifts-waiting-hero");
    const heroAccept = screen
      .getAllByRole("button", { name: /Принять/ })
      .find((b) => b.closest('[data-testid="gifts-waiting-hero"]'));
    expect(heroAccept).toBeTruthy();
    fireEvent.click(heroAccept!);

    await waitFor(() => expect(actMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(emitMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "gift_received", value: 1 }),
      ),
    );
  });

  it("does NOT emit gift_received milestone on decline", async () => {
    render(<Gifts />);
    await screen.findByTestId("gifts-waiting-hero");
    const heroDecline = screen
      .getAllByRole("button", { name: /Вежливо отказаться/ })
      .find((b) => b.closest('[data-testid="gifts-waiting-hero"]'));
    expect(heroDecline).toBeTruthy();
    fireEvent.click(heroDecline!);

    await waitFor(() => expect(actMock).toHaveBeenCalledTimes(1));
    // Decline path must not emit the gift_received milestone.
    const giftReceivedCalls = emitMock.mock.calls.filter(
      (c) => (c[0] as { kind?: string }).kind === "gift_received",
    );
    expect(giftReceivedCalls).toHaveLength(0);
  });
});