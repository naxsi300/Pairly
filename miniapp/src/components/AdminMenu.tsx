import { useEffect, useState } from "react";
import { endpoints, ApiError, type AdminPair, type AdminAuditEntry } from "../sdk/api";
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
type Tab = "overview" | "pairs" | "audit";

/**
 * Hidden admin dashboard — manage ALL pairs (not just your own): stats, a pair
 * list + Telegram-id lookup, per-pair Pro toggle, and the audit log. Only works
 * if your Telegram id is in PAIRLY_ADMIN_TG_IDS (else /api/admin/* → 404).
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
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<Status | null>(null);
  const [stats, setStats] = useState<{ total: number; pro: number; free: number; dissolved: number } | null>(null);
  const [pairs, setPairs] = useState<AdminPair[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [searchTg, setSearchTg] = useState("");
  const [lookup, setLookup] = useState<AdminPair | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDenied(false);
    setStatus(null);
    setLookup(null);
    setSearchTg("");
    endpoints
      .getAdminStatus()
      .then((s) => {
        setStatus(s as Status);
        return Promise.all([endpoints.getAdminStats(), endpoints.listAdminPairs(20, 0), endpoints.getAdminAudit(15)]);
      })
      .then(([st, pr, au]) => {
        setStats(st);
        setPairs(pr.items);
        setAudit(au.items);
      })
      .catch((e) => setDenied(e instanceof ApiError && (e.status === 404 || e.status === 403)));
  }, [open]);

  async function toggleSelfPro() {
    if (!status) return;
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

  async function togglePairPro(p: AdminPair) {
    setBusy(true);
    try {
      const res = await endpoints.setPairPro(p.pairId, !p.isPro);
      const next = res.isPro;
      setPairs((prev) => prev.map((x) => (x.pairId === p.pairId ? { ...x, isPro: next, tier: next ? "pro" : "free" } : x)));
      setLookup((l) => (l && l.pairId === p.pairId ? { ...l, isPro: next, tier: next ? "pro" : "free" } : l));
      setStats((s) => (s ? { ...s, pro: s.pro + (next ? 1 : -1), free: s.free + (next ? -1 : 1) } : s));
      if (status && p.pairId === status.pairId) {
        setPro(next);
        setStatus((st) => (st ? { ...st, isPro: next, tier: next ? "pro" : "free" } : st));
      }
      haptic("success");
    } catch {
      haptic("light");
    } finally {
      setBusy(false);
    }
  }

  async function doLookup() {
    const tg = Number(searchTg.trim());
    if (!tg) return;
    setLookup(null);
    try {
      setLookup(await endpoints.lookupPair(tg));
    } catch {
      setLookup(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🛠 Admin">
      {denied ? (
        <div className="card">
          <div className="card-title">Админ-доступ не настроен</div>
          <div className="card-sub">
            Добавь свой Telegram id в <code>PAIRLY_ADMIN_TG_IDS</code> на сервере.
          </div>
        </div>
      ) : !status ? (
        <p className="sub">Загрузка…</p>
      ) : (
        <>
          <div className="chip-row" style={{ marginBottom: 8 }}>
            {([["overview", "Обзор"], ["pairs", "Пары"], ["audit", "Лог"]] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip ${tab === id ? "active" : ""}`}
                style={{ flex: 1, textAlign: "center", justifyContent: "center" }}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <>
              {stats ? (
                <div className="stat-row" style={{ marginBottom: 8 }}>
                  <Stat n={stats.total} label="всего пар" />
                  <Stat n={stats.pro} label="Pro" />
                  <Stat n={stats.free} label="free" />
                </div>
              ) : null}
              <div className="card">
                <div className="card-row">
                  <span className="emoji" style={{ fontSize: 24 }}>{status.isPro ? "💛" : "🤍"}</span>
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{status.isPro ? "Pro активно" : "Free-уровень"}</div>
                    <div className="card-sub">ваша пара</div>
                  </div>
                </div>
              </div>
              <button type="button" className="btn-warm" onClick={toggleSelfPro} disabled={busy}>
                {status.isPro ? "Выключить Pro" : "Включить Pro (себе)"}
              </button>
              <p className="section-label" style={{ marginBottom: 4 }}>Отладка</p>
              <div className="card" style={{ gap: 4 }}>
                <Row k="pairId" v={status.pairId} />
                <Row k="userId" v={status.userId} />
                <Row k="tgId" v={String(status.tgId)} />
              </div>
            </>
          ) : null}

          {tab === "pairs" ? (
            <>
              <div className="card-actions" style={{ marginTop: 0 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Найти по Telegram id…"
                  inputMode="numeric"
                  value={searchTg}
                  onChange={(e) => setSearchTg(e.target.value)}
                />
                <button type="button" className="card-act primary" onClick={doLookup}>Найти</button>
              </div>
              {lookup ? <PairRow p={lookup} onToggle={togglePairPro} busy={busy} highlight /> : null}
              <p className="section-label" style={{ marginTop: 8, marginBottom: 4 }}>Недавние пары</p>
              {pairs.map((p) => (
                <PairRow key={p.pairId} p={p} onToggle={togglePairPro} busy={busy} />
              ))}
            </>
          ) : null}

          {tab === "audit" ? (
            <>
              {audit.length === 0 ? <p className="sub">пусто</p> : null}
              {audit.map((r, i) => (
                <div className="card" key={i} style={{ padding: 12 }}>
                  <div className="card-row" style={{ alignItems: "baseline" }}>
                    <span className="card-title" style={{ fontSize: 14 }}>{actionLabel(r.action)}</span>
                    <span className="card-sub" style={{ marginLeft: "auto" }}>tg {r.actorTgId}</span>
                  </div>
                  <div className="card-sub" style={{ fontFamily: "monospace", fontSize: 11 }}>{r.targetPairId}</div>
                </div>
              ))}
            </>
          ) : null}
        </>
      )}
    </Modal>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-big">{n}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function PairRow({ p, onToggle, busy, highlight }: { p: AdminPair; onToggle: (p: AdminPair) => void; busy: boolean; highlight?: boolean }) {
  const names = p.members.map((m) => m.name || m.username || m.tgId).join(" + ");
  return (
    <div className={`card ${highlight ? "" : ""}`} style={{ marginBottom: 6, background: highlight ? "var(--warm-container)" : undefined }}>
      <div className="card-row" style={{ alignItems: "center" }}>
        <span className="emoji" style={{ fontSize: 22 }}>{p.isPro ? "💛" : "🤍"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title" style={{ fontSize: 15 }}>{names || "—"}</div>
          <div className="card-sub" style={{ fontFamily: "monospace", fontSize: 11 }}>
            {p.pairId.slice(0, 8)} · {p.tier}
          </div>
        </div>
        <button type="button" className={`card-act ${p.isPro ? "ghost" : "warm"}`} disabled={busy} onClick={() => onToggle(p)}>
          {p.isPro ? "Off" : "Pro"}
        </button>
      </div>
    </div>
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

function actionLabel(action: string): string {
  return { grant_pro: "✨ Pro выдан", revoke_pro: "Pro снят" }[action] ?? action;
}
