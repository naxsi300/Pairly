import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NavBar } from "./NavBar";

describe("NavBar", () => {
  it("renders exactly 3 tabs: Home, Wishlist, Wheel", () => {
    render(<NavBar tab="home" onTabChange={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "🏠Главная",
      "🗒Вишлист",
      "🎡Колесо",
    ]);
  });

  it("marks the active tab", () => {
    render(<NavBar tab="wheel" onTabChange={() => {}} />);
    const buttons = screen.getAllByRole("button");
    const active = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(active?.textContent).toContain("Колесо");
  });

  it("calls onTabChange on click", () => {
    const onTabChange = vi.fn();
    render(<NavBar tab="home" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText("Колесо"));
    expect(onTabChange).toHaveBeenCalledWith("wheel");
  });
});
