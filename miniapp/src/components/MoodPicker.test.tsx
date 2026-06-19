import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MoodPicker } from "./MoodPicker";

describe("MoodPicker (R-warm tiles)", () => {
  it("renders one tile per mood and calls onPick", () => {
    const onPick = vi.fn();
    render(<MoodPicker value={null} onPick={onPick} />);
    // COPY.mood.moods has 5 entries; first is rendered with its emoji
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    fireEvent.click(buttons[0]);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("marks the active tile with aria-pressed", () => {
    render(<MoodPicker value={"хорошо" as never} onPick={() => {}} />);
    const active = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(active.length).toBe(1);
  });
});
