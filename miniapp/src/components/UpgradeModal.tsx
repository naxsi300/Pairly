import { Modal } from "./Modal";
import { COPY } from "../copy";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional: when provided, the modal exposes a warm "Убрать старое" submit
   *  button — the caller decides what that means (scroll to oldest, pre-open
   *  a delete confirm, etc.). When omitted, only the "Ладно" ghost is shown. */
  onDeleteOld?: () => void;
  /** Override the title (defaults to `COPY.common.upgradeSoon`). */
  title?: string;
}

/**
 * Warm, non-blocking replacement for the native `alert()` that used to fire
 * when a user hit a Pro-only limit. Reuses the gallery's `<Modal>` so the
 * upgrade CTA keeps the same bottom-sheet feel as every other dialog.
 *
 * Two shapes:
 *  - No `onDeleteOld` → just a soft "Ладно" dismiss.
 *  - With `onDeleteOld` → warm "Убрать старое" submit + "Ладно" ghost.
 *
 * The CTAs are deliberately *not* presented as a hard paywall (billing wires
 * in later). The tone is "soon, hang tight" so a free-tier user never feels
 * gated or nagged.
 */
export function UpgradeModal({
  open,
  onClose,
  onDeleteOld,
  title,
}: UpgradeModalProps) {
  // Body kept minimal — the title already carries the warm reassurance.
  return (
    <Modal
      open={open}
      title={title ?? COPY.common.upgradeSoon}
      onClose={onClose}
      secondaryLabel={COPY.common.upgradeOK}
      onSubmit={onDeleteOld}
      submitLabel={onDeleteOld ? COPY.common.deleteOld : undefined}
      submitVariant="primary"
    >
      {null}
    </Modal>
  );
}