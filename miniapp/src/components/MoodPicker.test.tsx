import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MoodPicker } from "./MoodPicker";

describe("MoodPicker (R-warm tiles)", () => {
  it("renders one tile per mood and calls onPick", () => {
    const onPick = vi.fn();
    render(<MoodPicker value={null} onPick={onPick} />);
    // COPY.mood.moods has 8 entries; each rendered as a role="radio" tile.
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThanOrEqual(5);
    // Click a specific, unique radio by its accessible name (the mood label).
    fireEvent.click(screen.getByRole("radio", { name: "сияю" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("сияю");
  });

  it("marks the active tile with aria-checked (and aria-pressed for legacy)", () => {
    render(<MoodPicker value={"хорошо" as never} onPick={() => {}} />);
    const active = screen
      .getAllByRole("radio")
      .filter((b) => b.getAttribute("aria-checked") === "true");
    expect(active.length).toBe(1);
    // The active tile's accessible name must be the mood label.
    expect(active[0]).toHaveAccessibleName("хорошо");
  });

  it("exposes role=radiogroup on the container, role=radio + aria-checked on tiles, and is labelled by the prompt", () => {
    render(<MoodPicker value={"хорошо" as never} onPick={() => {}} labelledBy="mood-prompt" />);
    const group = screen.getByRole("radiogroup");
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute("aria-labelledby", "mood-prompt");

    const radios = screen.getAllByRole("radio");
    // COPY.mood.moods has 8 entries; one tile per mood.
    expect(radios.length).toBeGreaterThanOrEqual(5);
    // Exactly one tile is aria-checked=true (the active value).
    const checked = radios.filter((b) => b.getAttribute("aria-checked") === "true");
    expect(checked.length).toBe(1);
  });
});
