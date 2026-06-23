import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotesCard } from "./NotesCard";

describe("NotesCard (sealed envelope preview)", () => {
  it("renders the envelope headline, the unread count on the seal, and the meta line", () => {
    render(<NotesCard unread={3} latestDaysAgo={1} onClick={() => {}} />);

    // Envelope header
    expect(screen.getByText("Записки для тебя")).toBeInTheDocument();
    // Unread count: the seal renders the number inside its 30px badge
    expect(screen.getByText("3")).toBeInTheDocument();
    // Genitive-plural form for 3
    expect(screen.getByText(/3 непрочитанные/i)).toBeInTheDocument();
    // "последняя — вчера" (daysAgo === 1)
    expect(screen.getByText(/последняя — вчера/i)).toBeInTheDocument();
  });

  it("uses correct Russian pluralization for the unread count", () => {
    const { rerender } = render(
      <NotesCard unread={1} latestDaysAgo={0} onClick={() => {}} />,
    );
    expect(screen.getByText(/1 непрочитанная/i)).toBeInTheDocument();
    expect(screen.getByText(/последняя — сегодня/i)).toBeInTheDocument();

    rerender(<NotesCard unread={5} latestDaysAgo={0} onClick={() => {}} />);
    expect(screen.getByText(/5 непрочитанных/i)).toBeInTheDocument();

    rerender(<NotesCard unread={22} latestDaysAgo={0} onClick={() => {}} />);
    // 22 follows the "few" Russian rule (mod10 in 2..4 and mod100 not in 12..14)
    // → genitive plural "непрочитанные", not the "many" form "непрочитанных".
    expect(screen.getByText(/22 непрочитанные/i)).toBeInTheDocument();
  });

  it("falls back to the empty-state meta when latestDaysAgo is null", () => {
    render(<NotesCard unread={0} latestDaysAgo={null} onClick={() => {}} />);
    // COPY.home.notesEmpty is the empty CTA
    expect(
      screen.getByText(/Напишите тёплые слова/i),
    ).toBeInTheDocument();
    // No "последняя —" relative phrase when there's no latest
    expect(screen.queryByText(/последняя —/)).not.toBeInTheDocument();
  });

  it("tappable root: renders a button that fires onClick", () => {
    const onClick = vi.fn();
    render(<NotesCard unread={2} latestDaysAgo={1} onClick={onClick} />);
    const btn = screen.getByRole("button", {
      name: /Записки: 2 непрочитанных/i,
    });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("privacy: NEVER renders any note body text", () => {
    // Realistic sample content that an actual note might contain.
    // The card must NEVER leak body text — only meta + counts.
    const SAMPLE_BODY = "Любимая, я скучаю по нашим вечерам у окна";
    const ANOTHER_BODY = "Прости за вчерашнее. Ты самое дорогое, что у меня есть";

    const { container } = render(
      <div>
        <NotesCard unread={1} latestDaysAgo={1} onClick={() => {}} />
        <NotesCard unread={0} latestDaysAgo={null} onClick={() => {}} />
      </div>,
    );

    const text = container.textContent ?? "";
    expect(text).not.toContain(SAMPLE_BODY);
    expect(text).not.toContain(ANOTHER_BODY);

    // Sanity: nothing note-body-shaped (no long Cyrillic prose) should
    // appear in the rendered DOM at all.
    expect(screen.queryByText(SAMPLE_BODY)).not.toBeInTheDocument();
    expect(screen.queryByText(ANOTHER_BODY)).not.toBeInTheDocument();
  });

  it("hides the pulsing unread dot and shows 0 on the seal when unread is 0", () => {
    const { container } = render(
      <NotesCard unread={0} latestDaysAgo={null} onClick={() => {}} />,
    );
    // The pulsing dot has box-shadow "0 0 8px var(--tg-warm)" — verify it
    // isn't rendered when there are no unread notes.
    const dotEls = container.querySelectorAll(
      "[style*='box-shadow: 0 0 8px']",
    );
    expect(dotEls.length).toBe(0);

    // The seal still renders 0 (so the envelope visual stays consistent).
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
