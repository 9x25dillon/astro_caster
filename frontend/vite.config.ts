import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config
export default defineConfig({
  resolve: {
    alias: {
      // Consume the ASTRA-CORE engines directly from source (they're TS with no
      // build step). Enables on-device chart casting when the backend is absent.
      "@astra/core": fileURLToPath(
        new URL("../packages/astra-core/src/browser.ts", import.meta.url)
      ),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      // Precache the self-hosted fonts too (workbox default is js/css/html
      // only) — the offline app shell must not fall back to system serifs.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
      manifest: {
        name: "Astra — Natal Observatory",
        short_name: "Astra",
        description: "Your natal observatory: celestial cartography, oracle readings, and symbolic reflection.",
        theme_color: "#0b0b0f",
        background_color: "#0b0b0f",
        display: "standalone",
        icons: [
          // SVG scales to any launcher size; avoids shipping binary PNGs.
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, stable libraries into their own long-cached chunk so
        // the app chunk stays small and a code change doesn't re-download them.
        manualChunks: {
          vendor: ["react", "react-dom", "zustand", "@react-spring/web"],
          d3: ["d3"],
          leaflet: ["leaflet"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1', // force IPv4; avoids ::1-only binding that breaks curl/fetch on some Linux systems
    // Proxy API calls to the FastAPI backend so the frontend talks to /api/* same-origin.
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
