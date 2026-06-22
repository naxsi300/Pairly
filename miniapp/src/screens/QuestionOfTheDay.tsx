import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi, type QOTDResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { emitMilestone } from "../lib/milestoneBus";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { TextArea } from "../components/Field";

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
        <EmptyState emoji="💭" text={COPY.qotd.empty} />
      </div>
    );
  }

  const partnerName = data.partnerName ?? "Партнёр";
  const iAnswered = Boolean(data.myAnswer);

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <h1 className="heading">{COPY.qotd.heading}</h1>

      <Card className="mb-3">
        <p className="text-xs uppercase tracking-wide text-tg-hint">{data.question.category}</p>
        <p className="mt-1 text-[15px] leading-relaxed text-tg-text">«{data.question.text}»</p>
      </Card>

      {answering ? (
        <Card className="mb-3">
          <p className="mb-2 text-sm text-tg-text">{COPY.qotd.answerPrompt}</p>
          <TextArea
            autoFocus
            rows={4}
            maxLength={MAX_ANSWER}
            placeholder={COPY.qotd.answerPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="mt-1 text-right text-xs text-tg-hint">
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
        </Card>
      ) : null}

      {/* Reveal gate: branch strictly on iAnswered. */}
      {!iAnswered ? (
        <Card>
          <p className="text-[15px] leading-relaxed text-tg-text">
            {COPY.qotd.revealLocked(partnerName)}
          </p>
          <div className="mt-3">
            <Button onClick={() => setAnswering(true)}>{COPY.qotd.answerButton}</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-tg-text">
            <span className="text-tg-hint">{COPY.qotd.myAnswerLabel}: </span>«{data.myAnswer}»
          </p>
          {data.partnerAnswered && data.partnerAnswer ? (
            <p className="mt-2 text-sm text-tg-text">
              <span className="text-tg-hint">
                {COPY.qotd.partnerAnswerLabel(partnerName)}:
              </span>{" "}
              «{data.partnerAnswer}»
            </p>
          ) : (
            <p className="mt-2 text-sm text-tg-hint">
              {COPY.qotd.waitingForPartner(partnerName)}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
