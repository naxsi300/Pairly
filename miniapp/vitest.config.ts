/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Provide the virtual:pwa-register module so tests can mock it.
    // devOptions.enabled is false → no actual SW is generated.
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
});