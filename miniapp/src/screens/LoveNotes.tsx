import { useState } from "react";
import type { CSSProperties } from "react";
import { COPY } from "../copy";
import { ApiError, endpoints, useApi, type LoveNoteItem } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { TextArea } from "../components/Field";
import { ScreenHeader } from "../components/ScreenHeader";

/** Love-notes inbox + composer, in the home feed's warm system (warm-wash note
 *  cards + the shared ScreenHeader). Scheduled via bot; no geo. Privacy: a
 *  note body is shown only inside this inbox, never on Home. */
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

  if (loading) return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader emoji="💌" title={COPY.notes.heading} />
      <p className="rw-empty">{COPY.common.loading}</p>
    </div>
  );
  if (error) return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader emoji="💌" title={COPY.notes.heading} />
      <p className="rw-empty" style={{ color: "var(--tg-danger)" }}>{COPY.common.error}</p>
    </div>
  );

  const notes = data ?? [];

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader
        emoji="💌"
        title={COPY.notes.heading}
        action={
          <Button variant="warm" onClick={() => setComposing(true)}>
            + {COPY.notes.send}
          </Button>
        }
      />

      {notes.length === 0 ? (
        <EmptyState emoji="💌" text={COPY.notes.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => {
            const unread = !n.mine && !n.readByRecipient;
            const style: CSSProperties = {
              width: "100%",
              textAlign: "left",
              border: "none",
              cursor: "pointer",
              font: "inherit",
              color: "inherit",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              borderRadius: 20,
              padding: "14px 16px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              background: unread
                ? "linear-gradient(135deg, color-mix(in srgb, var(--tg-warm) 14%, var(--tg-sec)), color-mix(in srgb, var(--tg-warm) 6%, var(--tg-sec)))"
                : "color-mix(in srgb, var(--tg-warm) 7%, var(--tg-sec))",
            };
            return (
              <li key={n.id}>
                <button type="button" onClick={() => openNote(n)} style={style} aria-label={n.mine ? COPY.notes.fromYou : COPY.notes.fromPartner}>
                  <span aria-hidden style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.2 }}>
                    {n.mine ? "💌" : "✉️"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="rw-meta" style={{ display: "block", marginBottom: 4 }}>
                      {n.mine ? COPY.notes.fromYou : COPY.notes.fromPartner}
                    </span>
                    <span className="card-title" style={{ display: "block", whiteSpace: "pre-wrap" }}>
                      {n.body}
                    </span>
                    {unread ? (
                      <span
                        className="meta"
                        style={{ color: "var(--tg-warm)", display: "inline-block", marginTop: 6 }}
                      >
                        ● новое
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
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
