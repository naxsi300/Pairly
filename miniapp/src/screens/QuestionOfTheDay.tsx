import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi, type QOTDResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { emitMilestone } from "../lib/milestoneBus";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { TextArea } from "../components/Field";
import { ScreenHeader } from "../components/ScreenHeader";

const MAX_ANSWER = 280;

/**
 * Reveal gate (HARD invariant, docs/copy/question-of-the-day.md):
 *   - If I have NOT answered → partner's answer is NEVER shown; show the locked
 *     prompt instead. Breaking this poisons the feature.
 *   - If I answered but partner hasn't → show only my answer + waiting copy.
 *   - If both answered → reveal both.
 *
 * The backend is the real enforcer; here we additionally ensure the UI never
 * renders the partner's text before `myAnswer` is non-null, even if the API
 * payload (mock) somehow included it.
 */
export function QuestionOfTheDay() {
  const { data, loading, error, refetch, setData } = useApi<QOTDResponse>(endpoints.getQotd);
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      // answerQotd returns { myAnswer, partnerAnswered, partnerAnswer,
      // newMilestones } — no `question` field. Spread into the existing
      // QOTDResponse so the question from the initial GET stays intact.
      const next = await endpoints.answerQotd({
        answer: draft.trim().slice(0, MAX_ANSWER),
      });
      setData((prev) => ({ ...(prev ?? ({} as QOTDResponse)), ...next }));
      setAnswering(false);
      setDraft("");
      haptic("success");
      for (const m of next.newMilestones ?? []) {
        emitMilestone({ kind: m.kind, value: m.value });
      }
    } catch {
      refetch();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>;
  }
  if (error) {
    return <p className="py-10 text-center text-[var(--tg-danger)]">{COPY.common.error}</p>;
  }
  if (!data?.question) {
    return (
      <div className="app-scroll mx-auto max-w-md px-4 py-4">
        <ScreenHeader emoji="💬" title={COPY.qotd.heading} />
        <EmptyState emoji="💭" text={COPY.qotd.empty} />
      </div>
    );
  }

  const partnerName = data.partnerName ?? "Партнёр";
  const iAnswered = Boolean(data.myAnswer);

  // Warm-wash question card — the day's question, with a chat-bubble tile so
  // it reads as the anchor of the screen.
  const questionCardStyle = {
    background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))",
    borderRadius: 20,
    padding: "14px 16px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  };

  // Stronger warm gradient for the answer / reveal card — this is the screen's
  // action surface, so it gets the "awaiting you" emphasis.
  const answerCardStyle = {
    background:
      "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 16%, var(--tg-sec)), color-mix(in srgb, var(--tg-warm) 6%, var(--tg-sec)))",
    borderRadius: 20,
    padding: "14px 16px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  };

  // Composer card — neutral warm-wash so the user's draft is the focus.
  const composerCardStyle = {
    background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))",
    borderRadius: 20,
    padding: "14px 16px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  };

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader emoji="💬" title={COPY.qotd.heading} />

      <div className="mb-3" style={questionCardStyle}>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
            flexShrink: 0,
          }}
        >
          💬
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="section-label" style={{ display: "block", margin: "0 0 6px" }}>
            {data.question.category}
          </span>
          <span className="card-title" style={{ display: "block" }}>«{data.question.text}»</span>
        </span>
      </div>

      {answering ? (
        <div className="mb-3" style={composerCardStyle}>
          <p className="card-sub">{COPY.qotd.answerPrompt}</p>
          <TextArea
            autoFocus
            rows={4}
            maxLength={MAX_ANSWER}
            placeholder={COPY.qotd.answerPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="meta text-right">
            {draft.length}/{MAX_ANSWER}
          </p>
          <div className="mt-2 flex gap-2">
            <Button onClick={submit} disabled={!draft.trim() || busy}>
              {COPY.common.save}
            </Button>
            <Button variant="ghost" onClick={() => setAnswering(false)}>
              {COPY.common.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Reveal gate: branch strictly on iAnswered. */}
      {!iAnswered ? (
        <div style={answerCardStyle}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
                flexShrink: 0,
              }}
            >
              ✍️
            </span>
            <p className="card-title" style={{ flex: 1, minWidth: 0, margin: 0 }}>
              {COPY.qotd.revealLocked(partnerName)}
            </p>
          </div>
          <div className="mt-3">
            <Button onClick={() => setAnswering(true)}>{COPY.qotd.answerButton}</Button>
          </div>
        </div>
      ) : (
        <div style={answerCardStyle}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                background: "color-mix(in srgb, var(--tg-warm) 18%, var(--tg-sec))",
                flexShrink: 0,
              }}
            >
              💬
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="card-title" style={{ margin: 0 }}>
                <span className="meta">{COPY.qotd.myAnswerLabel}: </span>«{data.myAnswer}»
              </p>
              {data.partnerAnswered && data.partnerAnswer ? (
                <p className="mt-2 card-title" style={{ margin: "8px 0 0" }}>
                  <span className="meta">
                    {COPY.qotd.partnerAnswerLabel(partnerName)}:
                  </span>{" "}
                  «{data.partnerAnswer}»
                </p>
              ) : (
                <p className="mt-2 meta" style={{ margin: "8px 0 0" }}>
                  {COPY.qotd.waitingForPartner(partnerName)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
