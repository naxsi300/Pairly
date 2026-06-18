import { COPY } from "../copy";
import { Button } from "./Button";
import { Card } from "./Card";

interface LimitBannerProps {
  text: string;
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
    <Card className="border border-[var(--m3-primary-container)]">
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
    </Card>
  );
}
