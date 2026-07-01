import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeHero } from "./WelcomeHero";

describe("WelcomeHero", () => {
  it("renders the title, subtitle, and 3 CTAs", () => {
    render(
      <WelcomeHero
        onGift={() => {}}
        onForward={() => {}}
        onNote={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("Ваш уголок 👋")).toBeInTheDocument();
    expect(screen.getByText("Пара тапов — и здесь станет уютно")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🎁 Отправить первый жест" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🗒 Переслать пост боту" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "💌 Написать записку" })).toBeInTheDocument();
  });

  it("calls onGift when the gift CTA is clicked", () => {
    const onGift = vi.fn();
    render(
      <WelcomeHero
        onGift={onGift}
        onForward={() => {}}
        onNote={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "🎁 Отправить первый жест" }));
    expect(onGift).toHaveBeenCalledTimes(1);
  });

  it("calls onForward when the forward CTA is clicked", () => {
    const onForward = vi.fn();
    render(
      <WelcomeHero
        onGift={() => {}}
        onForward={onForward}
        onNote={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "🗒 Переслать пост боту" }));
    expect(onForward).toHaveBeenCalledTimes(1);
  });

  it("calls onNote when the note CTA is clicked", () => {
    const onNote = vi.fn();
    render(
      <WelcomeHero
        onGift={() => {}}
        onForward={() => {}}
        onNote={onNote}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "💌 Написать записку" }));
    expect(onNote).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <WelcomeHero
        onGift={() => {}}
        onForward={() => {}}
        onNote={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /свернуть/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});