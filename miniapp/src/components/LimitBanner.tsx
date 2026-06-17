import { COPY } from "../copy";
import { Button } from "./Button";

interface LimitBannerProps {
  text: string;
  /** Free-tier count + max, shown as a small "N из M" line. */
  count?: number;
  max?: number;
  onUpgrade?: () => void;
  onDeleteOld?: () => void;
}

/**
 * Warm, acknowledged limit-hit banner. Never silently blocks — always offers
 * "Оформить Pro" or "Убрать старое". Copy per docs/copy/<feature>.md.
 */
export function LimitBanner({ text, count, max, onUpgrade, onDeleteOld }: LimitBannerProps) {
  return (
    <div className="card-glass border border-tg-link/20 p-4">
      <p className="text-sm leading-relaxed text-tg-text">{text}</p>
      {typeof count === "number" && typeof max === "number" ? (
        <p className="mt-1 text-xs text-tg-hint">
          {COPY.limitNote.count(count, max)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onUpgrade} disabled={!onUpgrade}>
          {COPY.common.upgradePro}
        </Button>
        <Button variant="secondary" onClick={onDeleteOld} disabled={!onDeleteOld}>
          {COPY.common.deleteOld}
        </Button>
      </div>
    </div>
  );
}
