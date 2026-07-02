import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      getQotd: vi.fn().mockResolvedValue({
        question: { id: "q1", text: "Вопрос дня?", category: "мечты" },
        myAnswer: null,
        partnerAnswered: false,
        partnerAnswer: null,
        partnerName: "Маша",
      }),
      answerQotd: vi.fn(),
      getQotdArchive: vi.fn().mockResolvedValue([
        {
          date: "2026-05-12T00:00:00Z",
          questionText: "Что тебя радует?",
          myAnswer: "весна",
          partnerAnswer: "твоя улыбка",
        },
        {
          date: "2026-04-30T00:00:00Z",
          questionText: "Мечта на год?",
          myAnswer: "море",
          partnerAnswer: "горы",
        },
      ]),
    },
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

vi.mock("../lib/milestoneBus", () => ({
  emitMilestone: () => {},
}));

import { QuestionOfTheDay } from "./QuestionOfTheDay";
import { endpoints } from "../sdk/api";

const answerMock = endpoints.answerQotd as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  answerMock.mockReset();
});

describe("QuestionOfTheDay — cluster 13 answerQotd return type", () => {
  it("spreads the backend's flat answerQotd response without losing fields", async () => {
    // The backend's /api/qotd/answer returns:
    //   { myAnswer, partnerAnswered, partnerAnswer, newMilestones }
    // — it does NOT include `question`. The previous answerQotd return type
    // was QOTDState (which has a `question` field) and the screen unsafely
    // cast with `as QOTDState & ...` then spread the result into the
    // QOTDResponse, which can drop `newMilestones` if TypeScript widens.
    //
    // The fix: answerQotd returns a narrower shape (no question) so the spread
    // merges the latest my/partner state into the existing QOTDResponse — the
    // question from the initial GET stays intact.
    answerMock.mockResolvedValue({
      myAnswer: "Мой ответ",
      partnerAnswered: false,
      partnerAnswer: null,
      newMilestones: [],
    });
    render(<QuestionOfTheDay />);

    // Question should be visible.
    expect(await screen.findByText(/Вопрос дня\?/)).not.toBeNull();

    // Open the answer form, type, submit.
    fireEvent.click(screen.getByText(/Ответить/));
    const textarea = (await screen.findByPlaceholderText(/Ваш ответ/)) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Мой ответ" } });
    fireEvent.click(screen.getByText("Сохранить"));

    // After submit, the question must STILL be on screen (the fix's spread
    // doesn't clobber the question) AND my answer must be shown.
    await waitFor(() => expect(screen.queryByText(/«Мой ответ»/)).not.toBeNull());
    expect(screen.queryByText(/Вопрос дня\?/)).not.toBeNull();
  });
});

describe("QuestionOfTheDay — Bundle D history sheet", () => {
  it("renders the 'История' button and opens the sheet with grouped past Q&As", async () => {
    render(<QuestionOfTheDay />);
    // Question is up; the history button must be visible on the screen.
    await screen.findByText(/Вопрос дня\?/);
    const historyButton = screen.getByRole("button", { name: /История/ });
    fireEvent.click(historyButton);

    // The sheet opens with the title; both rows render, grouped by month.
    expect(await screen.findByText("История вопросов")).not.toBeNull();
    // The mock returned two rows from different months (May + April) — both
    // month headers must appear; both questions too.
    await waitFor(() => {
      expect(screen.queryByText(/^2026-05$/)).not.toBeNull();
      expect(screen.queryByText(/^2026-04$/)).not.toBeNull();
      expect(screen.queryByText(/Что тебя радует\?/)).not.toBeNull();
      expect(screen.queryByText(/Мечта на год\?/)).not.toBeNull();
      // Both myAnswer and partnerAnswer bodies surface — the archive is a
      // history view (reveal gate does NOT apply).
      expect(screen.queryByText(/«весна»/)).not.toBeNull();
      expect(screen.queryByText(/«твоя улыбка»/)).not.toBeNull();
    });
  });

  it("shows 'Пока нет истории' when the archive is empty", async () => {
    const archiveMock = endpoints.getQotdArchive as unknown as ReturnType<typeof vi.fn>;
    archiveMock.mockResolvedValueOnce([]);
    render(<QuestionOfTheDay />);
    await screen.findByText(/Вопрос дня\?/);
    fireEvent.click(screen.getByRole("button", { name: /История/ }));
    expect(await screen.findByText("Пока нет истории")).not.toBeNull();
  });
});