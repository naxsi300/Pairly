import { useState } from "react";
import { COPY } from "../copy";
import { ApiError, endpoints, useApi, type LoveNoteItem } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { TextArea } from "../components/Field";

/** Love-notes inbox + composer (R-warm). Scheduled via bot; no geo. */
export function LoveNotes() {
  const { data, loading, error, refetch, setData } = useApi<LoveNoteItem[]>(endpoints.listLoveNotes);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const note = await endpoints.sendLoveNote({ body: draft.trim() });
      setData((prev) => [note, ...(prev ?? [])]);
      setDraft("");
      setComposing(false);
      haptic("success");
    } catch (e) {
      if (e instanceof ApiError) refetch();
    } finally {
      setBusy(false);
    }
  }

  async function openNote(n: LoveNoteItem) {
    if (n.mine || n.readByRecipient) return;
    setData((prev) =>
      (prev ?? []).map((x) => (x.id === n.id ? { ...x, readByRecipient: true } : x)),
    );
    try {
      await endpoints.readLoveNote(n.id);
    } catch {
      refetch();
    }
  }

  if (loading) return <p className="py-10 text-center text-tg-hint">{COPY.common.loading}</p>;
  if (error) return <p className="py-10 text-center text-red-500">{COPY.common.error}</p>;

  const notes = data ?? [];

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <header className="mb-1 flex items-center justify-between">
        <h1 className="rw-heading">{COPY.notes.heading}</h1>
        <Button onClick={() => setComposing(true)}>+ {COPY.notes.send}</Button>
      </header>
      <p className="rw-sub mb-3">{COPY.notes.sub}</p>

      {notes.length === 0 ? (
        <EmptyState emoji="💌" text={COPY.notes.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Card>
                <button
                  type="button"
                  onClick={() => openNote(n)}
                  className="w-full text-left"
                >
                  <p className="rw-meta mb-1">{n.mine ? COPY.notes.fromYou : COPY.notes.fromPartner}</p>
                  <p className="text-[15px] leading-snug text-tg-text">{n.body}</p>
                  {!n.mine && !n.readByRecipient ? (
                    <p className="rw-meta mt-1">новое</p>
                  ) : null}
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={composing}
        title={COPY.notes.heading}
        onClose={() => setComposing(false)}
        onSubmit={send}
        submitLabel={COPY.notes.send}
        submitDisabled={!draft.trim() || busy}
      >
        <TextArea
          placeholder={COPY.notes.placeholder}
          maxLength={1000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </Modal>
    </div>
  );
}
