import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OccasionCard, type Occasion } from "./OccasionCard";

const SAMPLE: Occasion = {
  emoji: "🎂",
  label: "День рождения Ани",
  sub: "до 14 июня",
  daysToOccasion: 5,
  occasionSoon: true,
};

describe("OccasionCard", () => {
  it("renders the giant numeral, the emoji stamp, the label, and the open CTA", () => {
    render(<OccasionCard occasion={SAMPLE} onClick={() => {}} />);
    // giant numeral = 5 (daysToOccasion)
    expect(screen.getByText("5")).toBeTruthy();
    // emoji stamp is rendered as literal text
    expect(screen.getByText("🎂")).toBeTruthy();
    // occasion.label and occasion.sub
    expect(screen.getByText("День рождения Ани")).toBeTruthy();
    expect(screen.getByText("до 14 июня")).toBeTruthy();
    // "Открыть" CTA
    expect(screen.getByText("Открыть")).toBeTruthy();
    // "скоро" pill (because occasionSoon)
    expect(screen.getByText("скоро")).toBeTruthy();
  });

  it("shows 'сегодня' instead of a numeral when daysToOccasion is 0", () => {
    render(
      <OccasionCard
        occasion={{ ...SAMPLE, daysToOccasion: 0 }}
        onClick={() => {}}
      />,
    );
    // "сегодня" appears twice: once as the big numeral, once as the meta
    // caption under it ("сегодня" rather than "дней").
    expect(screen.getAllByText("сегодня").length).toBeGreaterThanOrEqual(2);
    // the soon pill should still be visible (today is the most "soon" of all)
    expect(screen.getByText("скоро")).toBeTruthy();
  });

  it("renders the empty state from COPY.home.noOccasion when occasion is null", () => {
    render(<OccasionCard occasion={null} onClick={() => {}} />);
    // "Пока нет отсчётов" appears in two visible places: the meta line under
    // the dash numeral, and the footer label. Assert both render via
    // getAllByText so the test stays robust against either copy slot.
    expect(screen.getAllByText("Пока нет отсчётов").length).toBeGreaterThanOrEqual(2);
  });

  it("invokes onClick when the card is pressed", () => {
    const onClick = vi.fn();
    render(<OccasionCard occasion={SAMPLE} onClick={onClick} />);
    // the root element is the button; aria-label carries the occasion name
    const btn = screen.getByRole("button", { name: /День рождения Ани/ });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("hides the 'скоро' pill when occasionSoon is false", () => {
    render(
      <OccasionCard
        occasion={{ ...SAMPLE, occasionSoon: false }}
        onClick={() => {}}
      />,
    );
    expect(screen.queryByText("скоро")).toBeNull();
    // but the rest still renders
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("🎂")).toBeTruthy();
  });
});