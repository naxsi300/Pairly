import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      getMe: vi.fn(),
      patchMe: vi.fn(),
    },
    useApi: <T,>(_factory: unknown) => {
      // Resolve once so the screen gets its initial data.
      const data = (globalThis as unknown as { __meData?: T }).__meData;
      return {
        data: data ?? null,
        loading: false,
        error: null,
        refetch: vi.fn(),
        setData: () => {},
      };
    },
  };
});

vi.mock("../sdk/twa", () => ({ haptic: () => {} }));

import { Settings } from "./Settings";
import { endpoints } from "../sdk/api";

const getMeMock = endpoints.getMe as unknown as ReturnType<typeof vi.fn>;
const patchMeMock = endpoints.patchMe as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getMeMock.mockReset();
  patchMeMock.mockReset();
  delete (globalThis as unknown as { __meData?: unknown }).__meData;
});

describe("Settings — profile + pair-info + unpair screen", () => {
  it("renders all three sections and a Сохранить button", () => {
    (globalThis as unknown as { __meData?: unknown }).__meData = {
      id: "u1",
      displayName: "Аня",
      tgUsername: "anya_tg",
      pairCreatedAt: "2026-01-01T10:00:00Z",
      partnerDisplayName: "Миша",
    };
    render(<Settings />);
    // Heading.
    expect(screen.getByText("Настройки")).toBeInTheDocument();
    // You section.
    expect(screen.getByText("Вы")).toBeInTheDocument();
    expect(screen.getByText("Как вас видеть")).toBeInTheDocument();
    // Pair section.
    expect(screen.getByText("Пара")).toBeInTheDocument();
    // Pair section formats a date.
    const sinceLine = screen.getByText(/Вместе с/);
    expect(sinceLine.textContent).toMatch(/Вместе с/);
    // Danger section.
    expect(screen.getByText("Опасная зона")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Расстворить пару" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
  });

  it("hides the pair section when the user is unpaired", () => {
    (globalThis as unknown as { __meData?: unknown }).__meData = {
      id: "u1",
      displayName: "Solo",
      tgUsername: null,
      pairCreatedAt: null,
      partnerDisplayName: null,
    };
    render(<Settings />);
    // "Пара" header should NOT be present.
    expect(screen.queryByText("Пара")).not.toBeInTheDocument();
    // Save button still present.
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    // Danger zone still present (unpair can still be reached).
    expect(screen.getByText("Опасная зона")).toBeInTheDocument();
  });

  it("prefills the display-name input with the current displayName", () => {
    (globalThis as unknown as { __meData?: unknown }).__meData = {
      id: "u1",
      displayName: "Анна-Мария",
      tgUsername: "am",
      pairCreatedAt: null,
      partnerDisplayName: null,
    };
    render(<Settings />);
    const input = screen.getByLabelText(/Как вас видеть/) as HTMLInputElement;
    expect(input.value).toBe("Анна-Мария");
  });

  it("calls patchMe with the edited display name on Сохранить and shows Сохранено", async () => {
    patchMeMock.mockResolvedValue({
      id: "u1",
      displayName: "Анна-Мария 2.0",
      tgUsername: "am",
      pairCreatedAt: "2026-01-01T10:00:00Z",
      partnerDisplayName: "Миша",
    });
    (globalThis as unknown as { __meData?: unknown }).__meData = {
      id: "u1",
      displayName: "Анна-Мария",
      tgUsername: "am",
      pairCreatedAt: "2026-01-01T10:00:00Z",
      partnerDisplayName: "Миша",
    };
    render(<Settings />);

    const input = screen.getByLabelText(/Как вас видеть/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Анна-Мария 2.0" } });

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(patchMeMock).toHaveBeenCalledTimes(1),
    );
    expect(patchMeMock).toHaveBeenCalledWith({ displayName: "Анна-Мария 2.0" });

    // "Сохранено" feedback appears.
    await waitFor(() =>
      expect(screen.getByText("Сохранено")).toBeInTheDocument(),
    );
  });

  it("opens a confirm modal on Расстворить пару and, on submit, shows the bot-instruction text", async () => {
    (globalThis as unknown as { __meData?: unknown }).__meData = {
      id: "u1",
      displayName: "Аня",
      tgUsername: "anya",
      pairCreatedAt: "2026-01-01T10:00:00Z",
      partnerDisplayName: "Миша",
    };
    render(<Settings />);

    // Step 1: open confirm modal.
    fireEvent.click(screen.getByRole("button", { name: "Расстворить пару" }));
    // Confirm copy uses the partner's name.
    expect(
      screen.getByText("Точно расстворить пару с Миша? Это нельзя отменить."),
    ).toBeInTheDocument();

    // Step 2: submit.
    fireEvent.click(screen.getByRole("button", { name: "Расстворить" }));

    // Bot-instruction text appears after the confirm submit.
    await waitFor(() =>
      expect(
        screen.getByText("Через бота: отправьте /unpair нашему боту."),
      ).toBeInTheDocument(),
    );
    // Copy-command button is now visible.
    expect(
      screen.getByRole("button", { name: "Скопировать" }),
    ).toBeInTheDocument();
  });

  it("Скопировать copies /unpair to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    (globalThis as unknown as { __meData?: unknown }).__meData = {
      id: "u1",
      displayName: "Аня",
      tgUsername: "anya",
      pairCreatedAt: "2026-01-01T10:00:00Z",
      partnerDisplayName: "Миша",
    };
    render(<Settings />);

    // Walk past the confirm modal.
    fireEvent.click(screen.getByRole("button", { name: "Расстворить пару" }));
    fireEvent.click(screen.getByRole("button", { name: "Расстворить" }));

    const copyBtn = await screen.findByRole("button", { name: "Скопировать" });
    fireEvent.click(copyBtn);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("/unpair"),
    );
  });
});