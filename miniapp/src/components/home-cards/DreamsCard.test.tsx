import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DreamsCard } from "./DreamsCard";
import type { BucketItem } from "../../types";

const sampleDream: BucketItem = {
  id: "b1",
  title: "Увидеть рассвет в горах",
  status: "dreaming",
};

describe("DreamsCard", () => {
  it("renders the floating dream title and counts when a dream is provided", () => {
    const onClick = vi.fn();
    render(
      <DreamsCard
        dream={sampleDream}
        dreamingCount={7}
        doneCount={2}
        onClick={onClick}
      />,
    );

    // Title visible
    expect(screen.getByText("Увидеть рассвет в горах")).toBeInTheDocument();
    // Header label
    expect(screen.getByText(/Мечты/)).toBeInTheDocument();
    // Counts visible (both chips show their numbers)
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // The jar watermark is rendered
    expect(screen.getByText("сбылось")).toBeInTheDocument();
  });

  it("shows the empty-state copy when dream is null and stays tappable", () => {
    const onClick = vi.fn();
    render(
      <DreamsCard
        dream={null}
        dreamingCount={0}
        doneCount={0}
        onClick={onClick}
      />,
    );

    // No floating dream title
    expect(screen.queryByText("Увидеть рассвет в горах")).not.toBeInTheDocument();
    // Empty-state text from copy
    expect(screen.getByText(/Добавьте первую мечту/)).toBeInTheDocument();

    // Still a tappable button
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick when the card is pressed", () => {
    const onClick = vi.fn();
    render(
      <DreamsCard
        dream={sampleDream}
        dreamingCount={7}
        doneCount={2}
        onClick={onClick}
      />,
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an accessible label that includes the dream title", () => {
    render(
      <DreamsCard
        dream={sampleDream}
        dreamingCount={7}
        doneCount={2}
        onClick={() => {}}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label") ?? "").toContain("Увидеть рассвет в горах");
  });
});
