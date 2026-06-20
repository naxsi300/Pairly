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