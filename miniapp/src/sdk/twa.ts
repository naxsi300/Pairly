/**
 * Telegram WebApp SDK wrapper (@twa-dev/sdk v8 exports a typed WebApp object).
 *
 * Responsibilities:
 *  - Initialise the WebApp and request `ready` + `expand`.
 *  - Expose theme params (background/text colours) so the app can re-tint.
 *  - Wire the Telegram BackButton so it maps onto our in-app tab back-action.
 *  - Expose initData for the API client (backend HMAC-verifies it).
 *
 * Outside Telegram (plain browser dev), `getInitData()` returns empty; the API
 * client's dev-mode header `X-Dev-User-Id` takes over.
 */
import WebApp from "@twa-dev/sdk";

let initialised = false;

/** True when running inside the actual Telegram WebApp host. */
export function isTwa(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).Telegram?.WebApp);
}

/** Raw initData (Telegram-signed query string) or empty string outside Telegram. */
export function getInitData(): string {
  if (!isTwa()) return "";
  try {
    return WebApp.initData ?? "";
  } catch {
    return "";
  }
}

/**
 * Dev-mode fallback. In plain-browser dev, this returns a user id from
 * VITE_DEV_USER_ID so the API works against a backend running with PAIRLY_DEV_AUTH=1.
 * Inside Telegram, returns "" (real initData is used).
 */
export function getDevUserId(): string {
  if (isTwa()) return "";
  return (import.meta.env.VITE_DEV_USER_ID as string) ?? "";
}

/**
 * Initialise the SDK. Safe to call once. Returns true if running inside Telegram.
 */
export function initTwa(): boolean {
  if (initialised) return isTwa();
  initialised = true;

  if (!isTwa()) {
    return false;
  }

  try {
    WebApp.ready();
    WebApp.expand();
    WebApp.enableClosingConfirmation?.();

    applyThemeParams();
    WebApp.onEvent("themeChanged", applyThemeParams);
  } catch {
    /* swallow — degrade to non-Telegram UX */
  }
  return true;
}

/** Push Telegram theme params into :root as --tg-theme-* variables. */
function applyThemeParams(): void {
  const root = document.documentElement;
  const p = (WebApp.themeParams ?? {}) as unknown as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(p)) {
    if (!v) continue;
    const cssName = "--tg-theme-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    root.style.setProperty(cssName, v);
  }
  if (p.bgColor) root.style.setProperty("--tg-theme-bg-color", p.bgColor);
  if (p.textColor) root.style.setProperty("--tg-theme-text-color", p.textColor);
}

/** Show the Telegram back button and run `onClick` when pressed. Returns a disposer. */
export function showBackButton(onClick: () => void): (() => void) {
  if (!isTwa()) return () => {};
  try {
    const bb = WebApp.BackButton;
    bb.show();
    bb.onClick(onClick);
    return () => {
      bb.offClick(onClick);
      bb.hide();
    };
  } catch {
    return () => {};
  }
}

/** Haptic feedback helper (no-op outside Telegram). */
export function haptic(type: "light" | "success" | "error" = "light"): void {
  if (!isTwa()) return;
  try {
    const h = WebApp.HapticFeedback;
    if (type === "success") h.notificationOccurred("success");
    else if (type === "error") h.notificationOccurred("error");
    else h.impactOccurred("light");
  } catch {
    /* ignore */
  }
}

export { WebApp };
