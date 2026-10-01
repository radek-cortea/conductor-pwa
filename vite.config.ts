import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.PAGES_BASE_PATH || "/";

const chromePath = [
  process.env.CHROME_PATH,
  "/opt/google/chrome/chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((candidate): candidate is string => typeof candidate === "string" && existsSync(candidate));

export default defineConfig({
  base,
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 43123,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 43123,
    strictPort: true,
  },
  plugins: [
    {
      name: "production-security-policy",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content:
                "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.conductor.build; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
            },
            injectTo: "head-prepend",
          },
          {
            tag: "meta",
            attrs: { name: "referrer", content: "no-referrer" },
            injectTo: "head-prepend",
          },
        ];
      },
    },
    tanstackRouter({
      target: "react",
      autoCodeSplitting: false,
      quoteStyle: "double",
      semicolons: true,
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: [
        "favicon.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-512-maskable.png",
      ],
      manifest: {
        name: "Conductor PWA",
        short_name: "Conductor PWA",
        description: "Conductor cloud workspaces on your phone.",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
          {
            src: `${base}icons/icon-512-maskable.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        globIgnores: ["**/node_modules/**/*", "sw.js", "workbox-*.js", "**/mockServiceWorker.js"],
        runtimeCaching: (["GET", "HEAD", "POST"] as const).map((method) => ({
          urlPattern: /^https:\/\/api\.conductor\.build\/.*/i,
          handler: "NetworkOnly" as const,
          method,
        })),
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.tsx"],
          setupFiles: ["./src/test/browser-setup.ts"],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                ...(chromePath ? { executablePath: chromePath } : {}),
                args: ["--no-sandbox", "--disable-dev-shm-usage"],
              },
            }),
            instances: [
              { browser: "chromium", name: "phone", viewport: { width: 390, height: 844 } },
              { browser: "chromium", name: "desktop", viewport: { width: 1280, height: 800 } },
            ],
          },
        },
      },
    ],
  },
});
