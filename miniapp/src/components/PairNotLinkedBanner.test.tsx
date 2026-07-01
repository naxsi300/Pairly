import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PairNotLinkedBanner } from "./PairNotLinkedBanner";

describe("PairNotLinkedBanner", () => {
  let openTelegramLink: any;
  let openLink: any;

  beforeEach(() => {
    openTelegramLink = vi.fn();
    openLink = vi.fn();
    // Provide a Telegram host with both openLink (used by Wishlist.tsx) and
    // openTelegramLink (preferred for t.me deep links).
    (window as any).Telegram = {
      WebApp: { openTelegramLink, openLink },
    };
    // Default: clipboard copy fallback (no env URL configured).
    (import.meta.env as any).VITE_BOT_USERNAME = "";
  });

  afterEach(() => {
    delete (window as any).Telegram;
  });

  it("renders the title, subtitle, and CTA", () => {
    render(<PairNotLinkedBanner />);
    expect(
      screen.getByText("Это ваш уголок, но пока только ваш"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Пригласите партнёра: /pair в боте"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Открыть бота" }),
    ).toBeInTheDocument();
  });

  it("calls openTelegramLink with a t.me URL when VITE_BOT_USERNAME is configured", () => {
    (import.meta.env as any).VITE_BOT_USERNAME = "pairly_test_bot";
    render(<PairNotLinkedBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть бота" }));
    expect(openTelegramLink).toHaveBeenCalledTimes(1);
    expect(openTelegramLink).toHaveBeenCalledWith("https://t.me/pairly_test_bot");
  });

  it("falls back to window.open with a t.me URL in plain browser dev (no TWA host)", () => {
    delete (window as any).Telegram;
    (import.meta.env as any).VITE_BOT_USERNAME = "pairly_test_bot";
    const winOpen = vi.fn();
    const originalOpen = window.open;
    window.open = winOpen;
    try {
      render(<PairNotLinkedBanner />);
      fireEvent.click(screen.getByRole("button", { name: "Открыть бота" }));
      expect(winOpen).toHaveBeenCalledTimes(1);
      expect(winOpen.mock.calls[0][0]).toBe("https://t.me/pairly_test_bot");
    } finally {
      window.open = originalOpen;
    }
  });

  it("copies '/pair' to clipboard when no bot URL is configured", async () => {
    // navigator.clipboard is jsdom-optional; mock it directly.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<PairNotLinkedBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть бота" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("/pair");
  });
});