import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Rituals } from "./Rituals";

describe("Rituals", () => {
  it("lists the curated weekly rituals", () => {
    render(<Rituals />);
    expect(screen.getByText("Свидание вечером")).toBeTruthy();
    // count/total badge starts at 0/5
    expect(screen.getByText("0/5")).toBeTruthy();
  });

  it("toggles a ritual and updates the count", () => {
    render(<Rituals />);
    fireEvent.click(screen.getByText("Свидание вечером"));
    expect(screen.getByText("1/5")).toBeTruthy();
  });
});
