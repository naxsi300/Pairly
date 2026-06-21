import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// PWA service worker registration (shell-only cache via vite-plugin-pwa).
// The virtual module is provided by vite-plugin-pwa/client types.
import { registerSW } from "virtual:pwa-register";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Capture the updater so long-lived Telegram Mini App sessions can
// pick up new bundles without a manual reload. Two triggers:
//   1. Periodic poll (15 min) — catches updates for users who never leave
//      the tab but the SW gets a new version in the background.
//   2. visibilitychange — catches users who background the app and come back.
// Both call the same `updateSW(true)`; debounced by the SW's own internal
// check so a flood of triggers still produces one activation.
//
// onRegisterError surfaces SW registration failures (storage quota,
// insecure context, etc.) instead of swallowing them silently — we'd
// otherwise never know the offline shell is broken in production.
const SW_POLL_MS = 15 * 60 * 1000;
const updateSW = registerSW({
  immediate: true,
  onRegisterError(err) {
    // eslint-disable-next-line no-console
    console.error("[pwa] SW registration failed", err);
  },
});

const pollId = window.setInterval(() => {
  void updateSW(true);
}, SW_POLL_MS);

const onVisibility = () => {
  if (document.visibilityState === "visible") {
    void updateSW(true);
  }
};
document.addEventListener("visibilitychange", onVisibility);

// Clean up on full unload so the interval/listener don't keep firing
// in test harnesses that reload the page. SPA reloads (HMR) re-run
// main.tsx with a fresh setInterval.
const cleanup = () => {
  window.clearInterval(pollId);
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("pagehide", cleanup);
};
window.addEventListener("pagehide", cleanup, { once: true });