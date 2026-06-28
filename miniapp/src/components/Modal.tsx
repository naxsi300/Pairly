import type { FormEvent, ReactNode } from "react";
import { useEffect } from "react";
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
  children,
}: ModalProps) {
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
      >
        {title ? <h2 className="heading">{title}</h2> : null}
        <div className="flex flex-col gap-3">{children}</div>
        <div className="mt-5 flex gap-2">
          {onSubmit ? (
            <Button type="submit" full variant={submitVariant} disabled={submitDisabled}>
              {submitLabel ?? COPY.common.save}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" full={false} onClick={onClose}>
            {onSubmit ? COPY.common.cancel : COPY.common.close}
          </Button>
        </div>
      </form>
    </div>
  );
}
