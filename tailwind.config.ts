import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        moss: "#556b2f",
        tide: "#0f766e",
        clay: "#b45309"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 32, 42, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
