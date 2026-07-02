import { useEffect, useState } from "react";
import { COPY } from "../copy";
import { endpoints, useApi, type MeResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { TextInput } from "../components/Field";
import { ScreenHeader } from "../components/ScreenHeader";
import { Modal } from "../components/Modal";

const WARM_WASH: import("react").CSSProperties = {
  background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

/** Settings — R-warm: ScreenHeader + three warm-wash sections (You, Pair,
 *  Danger). You holds the display-name TextInput + Сохранить + "Сохранено"
 *  inline feedback. Pair reads pairCreatedAt + partnerDisplayName from the
 *  same /api/me payload. Danger opens a confirm modal; on submit the API is
 *  NOT called (unpair is bot-only) — instead the modal shows the literal
 *  `/unpair` command + a Скопировать button that writes it to the clipboard. */
export function Settings() {
  const { data, loading, error } = useApi<MeResponse>(endpoints.getMe);
  const [name, setName] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unpairDone, setUnpairDone] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  // Hydrate the input once /api/me resolves. Resetting on data.id change
  // keeps the input in sync if the user navigates between paired/unpaired
  // accounts (rare in TWA but harmless).
  useEffect(() => {
    if (data) setName(data.displayName ?? "");
  }, [data?.id, data?.displayName]);

  // Auto-fade the "Сохранено" feedback so it doesn't linger after the user
  // moves on. Two seconds is enough to read it without being noisy.
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [saved]);

  async function save() {
    if (!data) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError("Имя не может быть пустым");
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      await endpoints.patchMe({ displayName: trimmed });
      setSaved(true);
      haptic("success");
    } catch {
      setSaveError(COPY.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function copyUnpair() {
    try {
      await navigator.clipboard.writeText("/unpair");
      setCopyHint("Скопировано: /unpair — отправьте в боте");
    } catch {
      setCopyHint("Откройте бота и напишите /unpair");
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <span className="emoji">⏳</span>
        <div className="title">{COPY.common.loading}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty-state">
        <span className="emoji">😕</span>
        <div className="title">{COPY.common.error}</div>
      </div>
    );
  }

  // Format the pair-created date once, server-side ISO → local ru-RU long.
  const partnerName = data?.partnerDisplayName ?? "";
  const createdAt = data?.pairCreatedAt ?? null;
  const togetherDate = createdAt
    ? new Date(createdAt).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <ScreenHeader emoji="⚙️" title={COPY.settings.heading} />

      {/* You — display-name edit + Сохранить */}
      <section aria-label={COPY.settings.youSection} style={WARM_WASH}>
        <div className="section-label" style={{ margin: 0 }}>
          {COPY.settings.youSection}
        </div>
        <label
          htmlFor="settings-display-name"
          className="section-label"
          style={{ marginTop: 10, display: "block" }}
        >
          {COPY.settings.displayNameLabel}
        </label>
        <TextInput
          id="settings-display-name"
          aria-label={COPY.settings.displayNameLabel}
          placeholder={COPY.settings.displayNamePlaceholder}
          maxLength={128}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
            setSaveError(null);
          }}
          disabled={busy}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            className="btn-warm flex-1"
            onClick={save}
            disabled={busy}
          >
            {COPY.settings.save}
          </button>
          {saved ? (
            <span
              role="status"
              aria-live="polite"
              style={{
                color: "var(--tg-hint)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {COPY.settings.saved}
            </span>
          ) : null}
        </div>
        {saveError ? (
          <p role="alert" className="text-sm text-[var(--tg-danger)] mt-2">
            {saveError}
          </p>
        ) : null}

        {data?.tgUsername ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 13,
              color: "var(--tg-hint)",
            }}
          >
            Telegram: @{data.tgUsername}
          </div>
        ) : null}
      </section>

      {/* Pair — togetherSince (hidden if not paired) */}
      {createdAt && togetherDate ? (
        <section
          aria-label={COPY.settings.pairSection}
          style={{ ...WARM_WASH, marginTop: 14 }}
        >
          <div className="section-label" style={{ margin: 0 }}>
            {COPY.settings.pairSection}
          </div>
          <div className="card-title" style={{ marginTop: 8 }}>
            {COPY.settings.togetherSince(togetherDate)}
          </div>
          {partnerName ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "var(--tg-hint)",
              }}
            >
              Партнёр: {partnerName}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Danger — Расстворить пару → confirm → bot instruction + Скопировать */}
      <section
        aria-label={COPY.settings.unpairSection}
        style={{ ...WARM_WASH, marginTop: 14 }}
      >
        <div
          className="section-label"
          style={{ margin: 0, color: "var(--tg-danger)" }}
        >
          {COPY.settings.unpairSection}
        </div>
        {unpairDone ? (
          <>
            <p
              className="card-sub"
              style={{ marginTop: 10, color: "var(--tg-text)" }}
            >
              {COPY.settings.unpairViaBot}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={copyUnpair}
                data-testid="copy-unpair"
              >
                {COPY.settings.copyCommand}
              </button>
              {copyHint ? (
                <span
                  role="status"
                  aria-live="polite"
                  style={{
                    color: "var(--tg-hint)",
                    fontSize: 12,
                  }}
                >
                  {copyHint}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn-ghost"
            style={{
              marginTop: 10,
              color: "var(--tg-danger)",
              borderColor: "color-mix(in srgb, var(--tg-danger) 30%, transparent)",
            }}
            onClick={() => {
              haptic("light");
              setConfirmOpen(true);
            }}
          >
            {COPY.settings.unpairButton}
          </button>
        )}
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={COPY.settings.unpairButton}
        onSubmit={() => {
          // Bot-only flow — there is no API call. We flip the section into
          // the "instruction + copy" state and close the modal.
          haptic("medium");
          setUnpairDone(true);
          setConfirmOpen(false);
        }}
        submitLabel={COPY.settings.unpairSubmit}
        submitVariant="danger"
      >
        <p className="card-sub">
          {COPY.settings.unpairConfirm(partnerName || "партнёром")}
        </p>
      </Modal>
    </div>
  );
}