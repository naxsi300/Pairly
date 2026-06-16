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

registerSW({ immediate: true });
