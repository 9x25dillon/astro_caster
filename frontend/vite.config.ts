import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config
export default defineConfig(({ command }) => {
  // Dev (`serve`) ships a SELF-DESTROYING service worker: any browser that
  // still has a stale precached bundle from an earlier build fetches it via
  // autoUpdate on reload, and it unregisters itself + clears its caches — so
  // switching branches or rebuilding never leaves a wedged worker behind.
  // Production (`build`) always emits the real, caching PWA service worker.
  const dev = command === "serve";
  return {
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
      // In dev, serve a self-destroying SW (cleans up stale workers); in
      // production, the normal caching SW. devOptions.enabled must be true
      // in dev for the browser to fetch the self-destroying /sw.js at all.
      selfDestroying: dev,
      devOptions: { enabled: dev, type: "module" },
      includeAssets: ["favicon.svg"],
      // Precache the self-hosted fonts too (workbox default is js/css/html
      // only) — the offline app shell must not fall back to system serifs.
      // wasm + se1 are the on-device Swiss Ephemeris (extended chart bodies);
      // precaching them keeps the full body set available offline.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,wasm,se1}"],
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
        // Receive shared chart links: another app (or Astra itself) shares a
        // `?chart=<token>` URL, the OS opens Astra at "/" with it, and the store
        // decodes it into a cast. GET keeps it service-worker-free.
        share_target: {
          action: "/",
          method: "GET",
          params: { title: "title", text: "text", url: "url" },
        },
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, stable libraries into their own long-cached chunk so
        // the app chunk stays small and a code change doesn't re-download them.
        // vite 8's rolldown bundler requires the FUNCTION form of manualChunks
        // (the object form throws "Expected Function but received Object").
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/](d3|d3-[^\\/]+|internmap|delaunator|robust-predicates)[\\/]/.test(id)) return "d3";
          if (id.includes("/leaflet/")) return "leaflet";
          if (/[\\/](react|react-dom|scheduler|zustand|@react-spring)[\\/]/.test(id)) return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1', // force IPv4; avoids ::1-only binding that breaks curl/fetch on some Linux systems
    fs: {
      // @astra/core's vendored assets (WASM Swiss Ephemeris + seas_18.se1)
      // resolve to /@fs/ URLs outside the frontend root in dev — allow the
      // monorepo package dir alongside the default frontend root.
      allow: [".", "../packages"],
    },
    // Proxy API calls to the FastAPI backend so the frontend talks to /api/* same-origin.
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  };
});
