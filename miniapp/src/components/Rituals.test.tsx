import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Rituals } from "./Rituals";

describe("Rituals", () => {
  it("lists the curated weekly rituals", () => {
    render(<Rituals />);
    expect(screen.getByText("Свидание вечером")).toBeTruthy();
    expect(screen.getByText(/на этой неделе:/)).toBeTruthy();
  });

  it("toggles a ritual and updates the count", () => {
    render(<Rituals />);
    fireEvent.click(screen.getByText("Свидание вечером"));
    expect(screen.getByText(/на этой неделе: 1/)).toBeTruthy();
  });
});
