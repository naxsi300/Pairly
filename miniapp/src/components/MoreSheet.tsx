import { COPY } from "../copy";
import { Modal } from "./Modal";

export type Destination = "bucket" | "countdowns" | "gifts" | "qotd" | "notes";

/** Bottom-sheet listing the non-tab destination screens. */
export function MoreSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (d: Destination) => void;
}) {
  const items: { id: Destination; label: string }[] = [
    { id: "notes", label: COPY.home.moreNotes },
    { id: "bucket", label: COPY.home.moreBucket },
    { id: "countdowns", label: COPY.home.moreCountdowns },
    { id: "gifts", label: COPY.home.moreGifts },
    { id: "qotd", label: COPY.home.moreQotd },
  ];
  return (
    <Modal open={open} onClose={onClose} title={COPY.home.more}>
      <ul className="flex flex-col">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onPick(it.id)}
              className="w-full px-2 py-3 text-left text-base text-tg-text"
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
