import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthlyRecap } from "./MonthlyRecap";

describe("MonthlyRecap", () => {
  it("returns null when togetherDays < 7 (under-threshold pairs see no recap)", () => {
    const { container } = render(
      <MonthlyRecap togetherDays={0} qotd={3} deeds={5} dreams={2} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when togetherDays === 6 (boundary, still hidden)", () => {
    const { container } = render(
      <MonthlyRecap togetherDays={6} qotd={3} deeds={5} dreams={2} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the recap title + body when togetherDays === 7 (threshold met)", () => {
    render(<MonthlyRecap togetherDays={7} qotd={3} deeds={5} dreams={2} />);
    // Section label (caps warm) and the body line both surface.
    expect(screen.getByText(COPY.home.recapTitle)).toBeInTheDocument();
    expect(
      screen.getByText("3 вопросов · 5 добрых дел · 2 мечт сбылось"),
    ).toBeInTheDocument();
  });

  it("renders for established pairs (togetherDays=42) with all counts zero", () => {
    // Zero counts on an established pair is a valid state (they just
    // haven't done much yet) — the card should still appear, showing
    // 0/0/0 — the user explicitly wanted "the honest recap", not a
    // conditional hide.
    render(<MonthlyRecap togetherDays={42} qotd={0} deeds={0} dreams={0} />);
    expect(screen.getByText(COPY.home.recapTitle)).toBeInTheDocument();
    expect(
      screen.getByText("0 вопросов · 0 добрых дел · 0 мечт сбылось"),
    ).toBeInTheDocument();
  });
});

// Imported at the bottom under the same form the other Home-cards tests
// already use, so COPY stays out of the module-eval hoisting list.
import { COPY } from "../copy";
