import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Single-page Telegram Mini App. Shell-only PWA cache (no offline data sync).
// Dev server binds 0.0.0.0 so it is reachable from Telegram's web preview / tunnel.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Shell-only cache: HTML/JS/CSS/fonts. Data still needs network.
      includeAssets: ["manifest.webmanifest"],
      manifest: false, // we ship our own manifest.webmanifest in /public
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // Do NOT cache API responses — data must be fresh / pair-scoped.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2020",
  },
});
