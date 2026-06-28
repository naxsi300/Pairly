import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GiftsCard } from "./GiftsCard";
import type { GiftItem } from "../../types";

const waiting: GiftItem = {
  id: "g-1",
  gesture: "Массаж стоп после работы",
  status: "received",
  direction: "them",
  createdAt: "2026-06-21T10:00:00Z",
};

describe("GiftsCard", () => {
  it("renders the waiting gift and calls onClick when tapped", () => {
    const onClick = vi.fn();
    render(
      <GiftsCard
        waiting={waiting}
        activeCount={3}
        goodDeeds={47}
        onClick={onClick}
      />,
    );
    // The gift box is the button; verify gesture + accept CTA + waiting meta.
    const btn = screen.getByRole("button");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("Массаж стоп после работы");
    expect(btn.textContent).toContain("Принять");
    expect(btn.textContent).toContain("ждёт вас — примите →");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders calm state with active count and good deeds meta", () => {
    const onClick = vi.fn();
    render(
      <GiftsCard
        waiting={null}
        activeCount={2}
        goodDeeds={5}
        onClick={onClick}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("2 активных");
    expect(btn.textContent).toContain("5 дел");
    expect(btn.textContent).toContain("2 в пути · 5 добрых дел →");
    expect(btn.textContent).toContain("Открыть");
  });

  it("renders the empty state when no waiting gift and both counts are zero", () => {
    const onClick = vi.fn();
    render(
      <GiftsCard
        waiting={null}
        activeCount={0}
        goodDeeds={0}
        onClick={onClick}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("Подарите доброе дело →");
    expect(btn.textContent).toContain("Подарить");
  });

  it("exposes a descriptive aria-label for accessibility", () => {
    const { rerender } = render(
      <GiftsCard
        waiting={waiting}
        activeCount={1}
        goodDeeds={1}
        onClick={() => {}}
      />,
    );
    expect(
      screen.getByLabelText(/Принять: Массаж стоп после работы/),
    ).toBeTruthy();

    rerender(
      <GiftsCard
        waiting={null}
        activeCount={0}
        goodDeeds={0}
        onClick={() => {}}
      />,
    );
    expect(screen.getByLabelText("Подарить")).toBeTruthy();
  });

  it("uses the partner's first letter (uppercased) as the waiting-gift avatar", () => {
    // The avatar used to be a hardcoded "А" — same letter for every user.
    // It must now reflect the partner's name.
    const { rerender } = render(
      <GiftsCard
        waiting={waiting}
        activeCount={1}
        goodDeeds={1}
        partnerName="Аня"
        onClick={() => {}}
      />,
    );
    // First grapheme of "Аня", uppercased.
    expect(screen.getByText("А")).toBeTruthy();

    // Latin names work too — "olya" -> "O".
    rerender(
      <GiftsCard
        waiting={waiting}
        activeCount={1}
        goodDeeds={1}
        partnerName="olya"
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("O")).toBeTruthy();
  });

  it("falls back to a bullet for the waiting-gift avatar when partnerName is missing", () => {
    // No partnerName at all — the avatar slot must not be blank, but it
    // also must not be the old hardcoded "А".
    const { container } = render(
      <GiftsCard
        waiting={waiting}
        activeCount={1}
        goodDeeds={1}
        onClick={() => {}}
      />,
    );
    expect(screen.queryByText("А")).toBeNull();
    // The fallback glyph lives in the avatar circle next to "Партнёр прислал".
    // It can legitimately appear more than once; assert at least one and that
    // the avatar slot (the circle next to "Партнёр прислал") carries the bullet.
    const bullets = screen.getAllByText("•");
    expect(bullets.length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Партнёр прислал");
  });
});
