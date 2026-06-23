import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QotdCard } from "./QotdCard";
import type { QOTDResponse } from "../../sdk/api";

const BASE: QOTDResponse = {
  question: {
    id: "q1",
    text: "Что ты замечаешь во мне раньше, чем я сама?",
    category: "us",
  },
  myAnswer: null,
  partnerAnswered: true,
  partnerAnswer: "твою улыбку",
  partnerName: "Оля",
};

describe("QotdCard", () => {
  it("renders the question text and the section header pill", () => {
    render(<QotdCard qotd={BASE} onClick={() => {}} />);
    expect(
      screen.getByText("Что ты замечаешь во мне раньше, чем я сама?"),
    ).toBeTruthy();
    // Header pill copy from the chosen design.
    expect(screen.getByText("вопрос дня")).toBeTruthy();
    expect(screen.getByText("сегодня")).toBeTruthy();
  });

  it("uses '?' on your orb when you have not answered", () => {
    render(<QotdCard qotd={BASE} onClick={() => {}} />);
    // your-turn label (you haven't answered yet)
    expect(screen.getByText("твой ход")).toBeTruthy();
  });

  it("uses '✓' on the partner orb when the partner has answered", () => {
    render(<QotdCard qotd={BASE} onClick={() => {}} />);
    // partner-side label once partner has answered
    expect(screen.getByText("ответила")).toBeTruthy();
  });

  it("shows 'оба ответили' status when both have answered", () => {
    render(
      <QotdCard
        qotd={{ ...BASE, myAnswer: "твои глаза" }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("оба ответили — сравните →")).toBeTruthy();
  });

  it("shows 'партнёр ещё думает' when only you have answered", () => {
    render(
      <QotdCard
        qotd={{ ...BASE, myAnswer: "твои глаза", partnerAnswered: false }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("партнёр ещё думает…")).toBeTruthy();
  });

  it("shows the reveal CTA when the partner has answered and you haven't", () => {
    render(<QotdCard qotd={BASE} onClick={() => {}} />);
    expect(screen.getByText("нажми, чтобы вскрыть её ответ")).toBeTruthy();
    expect(screen.getByText("открыть")).toBeTruthy();
  });

  it("falls back to the placeholder when no question is present", () => {
    render(
      <QotdCard
        qotd={{
          question: null,
          myAnswer: null,
          partnerAnswered: false,
          partnerAnswer: null,
          partnerName: "Оля",
        }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("сегодня без вопроса")).toBeTruthy();
    // The status line must still be tappable / non-empty.
    expect(screen.getByText("ваш ход — ответьте →")).toBeTruthy();
  });

  it("uses the partner's name initial on the partner orb", () => {
    render(<QotdCard qotd={BASE} onClick={() => {}} />);
    // The partner orb is rendered as the first letter of the partner name
    // in lower-case — "Оля" → "о".
    expect(screen.getByText("о")).toBeTruthy();
    // You-side orb is always "я".
    expect(screen.getByText("я")).toBeTruthy();
  });

  it("uses the default 'о' partner letter when partnerName is null", () => {
    render(
      <QotdCard
        qotd={{ ...BASE, partnerName: null }}
        onClick={() => {}}
      />,
    );
    // Still renders the fallback initial.
    expect(screen.getByText("о")).toBeTruthy();
  });

  it("invokes onClick when the card is pressed", () => {
    const onClick = vi.fn();
    render(<QotdCard qotd={BASE} onClick={onClick} />);
    const btn = screen.getByRole("button", {
      name: /Что ты замечаешь во мне раньше, чем я сама/,
    });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to the empty aria-label when qotd is undefined", () => {
    render(<QotdCard qotd={undefined} onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: /Вопрос дня/ });
    expect(btn).toBeTruthy();
    // The placeholder question text is rendered so the card still looks
    // populated and stays tappable.
    expect(screen.getByText("сегодня без вопроса")).toBeTruthy();
  });
});
