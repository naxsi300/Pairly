import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      getMood: vi.fn(),
      setMood: vi.fn(),
      clearMood: vi.fn(),
    },
    useApi: <T,>(_factory: unknown) => {
      // Resolve once so the screen gets its initial data.
      const data = (globalThis as unknown as { __moodData?: T }).__moodData;
      return {
        data: data ?? null,
        loading: false,
        error: null,
        refetch: vi.fn(),
        setData: () => {},
      };
    },
  };
});

vi.mock("../sdk/twa", () => ({ haptic: () => {} }));

import { Mood } from "./Mood";
import { endpoints } from "../sdk/api";

const setMoodMock = endpoints.setMood as unknown as ReturnType<typeof vi.fn>;
const clearMoodMock = endpoints.clearMood as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  setMoodMock.mockReset();
  clearMoodMock.mockReset();
  delete (globalThis as unknown as { __moodData?: unknown }).__moodData;
});

describe("Mood — partner name preservation + error surfacing", () => {
  it("renders a partner name containing an em-dash without stripping the dash from the name", async () => {
    (globalThis as unknown as { __moodData?: unknown }).__moodData = {
      self: null,
      partner: { mood: "хорошо", note: null, setAt: new Date().toISOString() },
      partnerName: "Анна-Мария",
    };
    render(<Mood />);
    // Name must appear verbatim, with the em-dash intact (in the section-label
    // slot — the partner card renders name and mood as separate DOM nodes,
    // so the name is no longer joined to the mood with an em-dash).
    const nameNodes = screen.getAllByText("Анна-Мария");
    expect(nameNodes.length).toBeGreaterThanOrEqual(1);
    expect(nameNodes[0]).toBeInTheDocument();
    // The combined aria-label on the partner wash container is the only place
    // "Анна-Мария" and the mood appear together.
    expect(
      screen.getByLabelText("Анна-Мария: хорошо"),
    ).toBeInTheDocument();
  });

  it("uses a single aria-label on the partner card (no duplicate of name in the label)", () => {
    (globalThis as unknown as { __moodData?: unknown }).__moodData = {
      self: null,
      partner: { mood: "сияю", note: null, setAt: new Date().toISOString() },
      partnerName: "Анна-Мария",
    };
    render(<Mood />);
    // The aria-label is set on the WARM_WASH container that holds the partner info.
    const labelled = screen.getByLabelText("Анна-Мария: сияю");
    expect(labelled).toBeInTheDocument();
    // The name should appear exactly once in the visible section label
    // (we don't double-print it inside the title row).
    const sectionLabels = screen.getAllByText("Анна-Мария");
    expect(sectionLabels.length).toBe(1);
  });

  it("surfaces an inline error when save() fails", async () => {
    (globalThis as unknown as { __moodData?: unknown }).__moodData = {
      self: null,
      partner: null,
      partnerName: "Анна-Мария",
    };
    setMoodMock.mockRejectedValue(new Error("network"));
    render(<Mood />);

    // Pick a mood (first option), then click "Сохранить".
    const radio = screen.getAllByRole("radio")[0];
    fireEvent.click(radio);
    const saveBtn = screen.getByRole("button", { name: /Сохранить/ });
    fireEvent.click(saveBtn);

    // Inline error paragraph with role="alert" appears.
    await waitFor(() =>
      expect(
        screen.getByRole("alert"),
      ).toHaveTextContent(/Не удалось сохранить настроение/),
    );
  });

  it("surfaces an inline error when clear() fails after a self-mood is set", async () => {
    const setAt = new Date().toISOString();
    (globalThis as unknown as { __moodData?: unknown }).__moodData = {
      self: { mood: "хорошо", note: null, setAt },
      partner: null,
      partnerName: "Анна-Мария",
    };
    clearMoodMock.mockRejectedValue(new Error("network"));
    render(<Mood />);

    const clearBtn = screen.getByRole("button", { name: /Убрать настроение/ });
    fireEvent.click(clearBtn);

    await waitFor(() =>
      expect(
        screen.getByRole("alert"),
      ).toHaveTextContent(/Не удалось убрать настроение/),
    );
  });

  it("prompt heading id matches the radiogroup aria-labelledby", () => {
    (globalThis as unknown as { __moodData?: unknown }).__moodData = {
      self: null,
      partner: null,
      partnerName: "Анна-Мария",
    };
    render(<Mood />);
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAttribute("aria-labelledby", "mood-prompt");
    // The labelled element exists in the DOM.
    expect(document.getElementById("mood-prompt")).not.toBeNull();
  });
});
