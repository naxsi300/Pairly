/** @type {import('tailwindcss').Config} */
// Tailwind only (no component lib). Colors reference Telegram theme CSS vars so the
// app follows the user's light/dark scheme. See src/index.css for var wiring.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Map to Telegram theme variables (defined in :root of index.css).
        tg: {
          bg: "var(--tg-theme-bg-color)",
          text: "var(--tg-theme-text-color)",
          hint: "var(--tg-theme-hint-color)",
          link: "var(--tg-theme-link-color)",
          button: "var(--tg-theme-button-color)",
          buttonText: "var(--tg-theme-button-text-color)",
          secondary: "var(--tg-theme-secondary-bg-color)",
        },
      },
      fontFamily: {
        sans: [
          "var(--tg-font, 'Roboto')",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
