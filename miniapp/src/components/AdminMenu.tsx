import { useEffect, useState } from "react";
import { endpoints, ApiError } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { Modal } from "./Modal";

type Status = {
  pairId: string;
  userId: string;
  tgId: number;
  tier: string | null;
  isPro: boolean;
  adminEnabled: boolean;
};

/**
 * Hidden admin/debug sheet — pair info + a Pro toggle (to exercise the paywall &
 * Pro-gated wheel modes). Only meaningful if your Telegram id is in
 * PAIRLY_ADMIN_TG_IDS on the server; otherwise /api/admin/* returns 404.
 */
export function AdminMenu({
  open,
  onClose,
  setPro,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  setPro: (next: boolean) => void;
  refresh: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDenied(false);
    setStatus(null);
    endpoints
      .getAdminStatus()
      .then((s) => setStatus(s as Status))
      .catch((e) => {
        // 404 = not an admin TG id (endpoint hidden for regular users).
        setDenied(e instanceof ApiError && (e.status === 404 || e.status === 403));
      });
  }, [open]);

  async function toggle() {
    setBusy(true);
    try {
      const res = await endpoints.togglePro();
      setPro(res.isPro);
      setStatus((s) => (s ? { ...s, isPro: res.isPro, tier: res.isPro ? "pro" : "free" } : s));
      haptic("success");
      refresh();
    } catch {
      haptic("light");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🛠 Admin">
      {denied ? (
        <div className="card">
          <div className="card-title">Админ-доступ не настроен</div>
          <div className="card-sub">
            Добавь свой Telegram id в <code>PAIRLY_ADMIN_TG_IDS</code> на сервере, чтобы видеть
            этот экран.
          </div>
        </div>
      ) : !status ? (
        <p className="sub">Загрузка…</p>
      ) : (
        <>
          <div className="card">
            <div className="card-row">
              <span className="emoji" style={{ fontSize: 24 }}>{status.isPro ? "💛" : "🤍"}</span>
              <div style={{ flex: 1 }}>
                <div className="card-title">{status.isPro ? "Pro активно" : "Free-уровень"}</div>
                <div className="card-sub">tier: {status.tier ?? "—"}</div>
              </div>
            </div>
          </div>
          <button type="button" className="btn-warm" onClick={toggle} disabled={busy}>
            {status.isPro ? "Выключить Pro" : "Включить Pro"}
          </button>

          <p className="section-label" style={{ marginBottom: 4 }}>Отладка</p>
          <div className="card" style={{ gap: 4 }}>
            <Row k="pairId" v={status.pairId} />
            <Row k="userId" v={status.userId} />
            <Row k="tgId" v={String(status.tgId)} />
          </div>
        </>
      )}
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="card-row" style={{ gap: 8 }}>
      <span className="card-sub" style={{ flexShrink: 0 }}>{k}</span>
      <span className="card-sub" style={{ color: "var(--tg-text)", fontFamily: "monospace", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {v}
      </span>
    </div>
  );
}
