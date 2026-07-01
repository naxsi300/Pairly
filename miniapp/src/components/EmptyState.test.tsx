import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders emoji + text + optional hint", () => {
    render(<EmptyState emoji="🌌" text="Пусто" hint="Подсказка" />);
    expect(screen.getByText("🌌")).toBeInTheDocument();
    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText("Подсказка")).toBeInTheDocument();
  });

  it("renders nothing when no hint", () => {
    const { container } = render(<EmptyState text="Пусто" />);
    // The desc node is conditionally rendered — there should be no .desc child.
    expect(container.querySelector(".desc")).toBeNull();
  });

  it("does not render an action button when no action prop is passed", () => {
    render(<EmptyState emoji="🌌" text="Пусто" hint="Подсказка" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the action button with the provided label when action is passed", () => {
    render(
      <EmptyState
        emoji="🌌"
        text="Пусто"
        hint="Подсказка"
        action={{ label: "Добавить", onClick: () => {} }}
      />,
    );
    const btn = screen.getByRole("button", { name: "Добавить" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("btn-warm");
  });

  it("calls action.onClick when the button is clicked", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        emoji="🌌"
        text="Пусто"
        action={{ label: "Добавить", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});