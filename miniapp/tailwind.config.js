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
        xl3: "1.5rem",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
        glow: "0 4px 24px rgba(0,0,0,0.06)",
      },
      transitionDuration: {
        300: "300ms",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop": {
          "0%": { transform: "scale(0.92)" },
          "60%": { transform: "scale(1.04)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 280ms ease-out",
        pop: "pop 320ms ease-out",
      },
    },
  },
  plugins: [],
};
