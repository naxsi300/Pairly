import type { FormEvent, ReactNode } from "react";
import { useEffect, useId } from "react";
import { Button } from "./Button";
import { COPY } from "../copy";

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  /** Submit handler. If omitted, no submit button is shown. */
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  /** Submit-button variant. Defaults to "primary"; use "danger" for destructive
   * confirms (Bucket/Wishlist delete). */
  submitVariant?: "primary" | "danger";
  /** Override the secondary/ghost button label. Defaults to "Отмена" when a
   * submit handler is present, and "Закрыть" when it isn't. Useful for
   * one-off dialogs (e.g. UpgradeModal's soft "Ладно") that need a custom
   * dismiss copy without rebuilding the whole modal. */
  secondaryLabel?: string;
  children: ReactNode;
}

/** Lightweight bottom-sheet-style modal. No focus trap lib — kept minimal. */
export function Modal({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitDisabled,
  submitVariant = "primary",
  secondaryLabel,
  children,
}: ModalProps) {
  // Stable id so the dialog can announce its title to screen readers via
  // aria-labelledby. The body container gets aria-describedby so AT users
  // hear the descriptive content (form fields, prompts) on open.
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md card p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={bodyId}
      >
        {title ? (
          <h2 id={titleId} className="heading">
            {title}
          </h2>
        ) : null}
        <div id={bodyId} className="flex flex-col gap-3">
          {children}
        </div>
        <div className="mt-5 flex gap-2">
          {onSubmit ? (
            <Button type="submit" full variant={submitVariant} disabled={submitDisabled}>
              {submitLabel ?? COPY.common.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" full={false} onClick={onClose}>
            {secondaryLabel ?? (onSubmit ? COPY.common.cancel : COPY.common.close)}
          </Button>
        </div>
      </form>
    </div>
  );
}
