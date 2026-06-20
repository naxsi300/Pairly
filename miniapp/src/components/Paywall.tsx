import { Modal } from "./Modal";

/**
 * Pro paywall — shown when a non-Pro user reaches a Pro-only action (the wheel's
 * "Умный" / "Мне повезёт" modes). Warm, non-aggressive: list what Pro unlocks and
 * a placeholder CTA (real billing — USDT/СБП — wires in later).
 */
export function Paywall({
  open,
  onClose,
  onAdminHint,
}: {
  open: boolean;
  onClose: () => void;
  /** Optional: a subtle "test as Pro" affordance (the hidden admin menu). Dev-only. */
  onAdminHint?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="✨ Pairly Pro">
      <div className="hero-warm" style={{ textAlign: "center", padding: "22px 18px" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>💞</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Больше свиданий — меньше рутины</div>
        <div style={{ fontSize: 13, color: "var(--tg-hint)", marginTop: 4 }}>
          Колесо работает умнее, пока вы просто наслаждаетесь вечером
        </div>
      </div>

      <div className="card">
        <div className="card-title">Что открывает Pro</div>
      </div>
      <ul className="flex flex-col gap-2" style={{ marginTop: 2 }}>
        {[
          ["🧠", "«Умный» режим", "подбор из вишлиста по городу, погоде и настроению пары"],
          ["🍀", "«Мне повезёт»", "нейросеть предлагает свидание — даже не из вашего списка"],
          ["♾️", "Без лимитов", "неограниченный вишлист, отсчёты и мечты"],
        ].map(([emoji, title, desc]) => (
          <li key={title} className="card card-row" style={{ alignItems: "flex-start" }}>
            <span className="emoji" style={{ fontSize: 24 }}>{emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="card-title">{title}</div>
              <div className="card-sub">{desc}</div>
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="btn-warm" style={{ marginTop: 10 }} onClick={() => alert("Оплата подключается позже (USDT/СБП).")}>
        Оформить Pro
      </button>
      {onAdminHint ? (
        <button type="button" className="btn-ghost" style={{ marginTop: 8 }} onClick={onAdminHint}>
          Тестировать как Pro
        </button>
      ) : null}
    </Modal>
  );
}
