import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MoodCard } from "./MoodCard";
import type { MoodResponse } from "../../sdk/api";

const FULL: MoodResponse = {
  self: { mood: "радостно", note: null, setAt: "2026-06-21T10:00:00Z" },
  partner: { mood: "спокойно", note: null, setAt: "2026-06-21T10:05:00Z" },
  partnerName: "маша",
};

describe("MoodCard", () => {
  it("renders both mood emojis, both labels, the partner name, and the live pill", () => {
    render(<MoodCard mood={FULL} onClick={() => {}} />);
    // both orbs show their emojis as literal text. "радостно" -> 😄, "спокойно" -> 😌
    // per COPY.mood.moods (see src/copy.ts).
    expect(screen.getByText("😄")).toBeTruthy();
    expect(screen.getByText("😌")).toBeTruthy();
    // mood labels are visible under each orb
    expect(screen.getByText("радостно")).toBeTruthy();
    expect(screen.getByText("спокойно")).toBeTruthy();
    // partner name renders verbatim
    expect(screen.getByText("маша")).toBeTruthy();
    // "сейчас" live pill is always visible — it is the live ambient read
    expect(screen.getByText("сейчас")).toBeTruthy();
    // "Ты" header label (mirrors COPY.mood.youLabel exactly — capital Т).
    expect(screen.getByText("Ты")).toBeTruthy();
    // harmony caption sits between the orbs
    expect(screen.getByText("в резонансе")).toBeTruthy();
  });

  it("falls back to COPY.mood.partnerLabel when partnerName is missing", () => {
    render(
      <MoodCard
        mood={{ ...FULL, partnerName: null }}
        onClick={() => {}}
      />,
    );
    // COPY.mood.partnerLabel = "Партнёр"
    expect(screen.getByText("Партнёр")).toBeTruthy();
  });

  it("shows the muted placeholder when self mood is missing", () => {
    render(
      <MoodCard
        mood={{ self: null, partner: FULL.partner, partnerName: "маша" }}
        onClick={() => {}}
      />,
    );
    // COPY.mood.notSet appears at least once
    expect(screen.getAllByText("настроение не задано").length).toBeGreaterThanOrEqual(1);
    // partner side still renders normally
    expect(screen.getByText("маша")).toBeTruthy();
    expect(screen.getByText("спокойно")).toBeTruthy();
  });

  it("renders a placeholder when the entire mood payload is null", () => {
    render(<MoodCard mood={null} onClick={() => {}} />);
    // still tappable and renders the muted copy + the live pill
    expect(screen.getByText("сейчас")).toBeTruthy();
    expect(screen.getAllByText("настроение не задано").length).toBeGreaterThanOrEqual(1);
  });

  it("invokes onClick when the card is pressed", () => {
    const onClick = vi.fn();
    render(<MoodCard mood={FULL} onClick={onClick} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lights the connector when both partners share the same mood", () => {
    const same: MoodResponse = {
      self: { mood: "хорошо", note: null, setAt: "2026-06-21T10:00:00Z" },
      partner: { mood: "хорошо", note: null, setAt: "2026-06-21T10:05:00Z" },
      partnerName: "маша",
    };
    const { container } = render(
      <MoodCard mood={same} onClick={() => {}} />,
    );
    const arc = container.querySelector("[data-resonance='on'] path");
    expect(arc).toBeTruthy();
    // when in resonance the dashed look goes away (no stroke-dasharray attr)
    expect(arc?.getAttribute("stroke-dasharray")).toBeFalsy();
    // the resonance-node circle carries the class
    expect(
      container.querySelector("[data-resonance='on'] circle.resonance-node"),
    ).toBeTruthy();
  });

  it("keeps the dotted calm connector when moods differ", () => {
    const different: MoodResponse = {
      self: { mood: "хорошо", note: null, setAt: "2026-06-21T10:00:00Z" },
      partner: { mood: "радостно", note: null, setAt: "2026-06-21T10:05:00Z" },
      partnerName: "маша",
    };
    const { container } = render(
      <MoodCard mood={different} onClick={() => {}} />,
    );
    const connector = container.querySelector("[data-resonance='off']");
    expect(connector).toBeTruthy();
    const arc = connector!.querySelector("path");
    // dotted is preserved in non-resonance
    expect(arc?.getAttribute("stroke-dasharray")).toBeTruthy();
    // no pulse class in non-resonance
    expect(connector!.querySelector("circle.resonance-node")).toBeFalsy();
  });

  it("treats resonance as off when either side has no mood", () => {
    const missing: MoodResponse = {
      self: null,
      partner: { mood: "хорошо", note: null, setAt: "2026-06-21T10:05:00Z" },
      partnerName: "маша",
    };
    const { container } = render(
      <MoodCard mood={missing} onClick={() => {}} />,
    );
    // self is missing -> cannot be in resonance
    expect(
      container.querySelector("[data-resonance='off']"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-resonance='on']"),
    ).toBeFalsy();
  });
});
