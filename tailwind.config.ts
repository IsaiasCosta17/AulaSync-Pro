import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        canvas: "#F5F6F8",
        brand: {
          50: "#F1F7FF",
          100: "#E1EEFF",
          500: "#2878FF",
          600: "#1665E8",
          700: "#124FBA",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.04)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
