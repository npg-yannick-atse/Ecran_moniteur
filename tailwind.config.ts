import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // WMS palette (from PAGE_TEST_V3 mockups)
        wms: {
          darker: "#004f5e",
          dark: "#006d82",
          DEFAULT: "#008ea9",
          light: "#33a8bf",
          lighter: "#b3e0ea",
          bg: "#e6f5f8",
        },
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "live-pulse": "pulse 2s infinite",
        blink: "blink 2s infinite",
      },
    },
  },
  plugins: [],
}

export default config
