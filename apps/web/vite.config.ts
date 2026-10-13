import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    // 1. TanStack Router — must come BEFORE the React plugin
    //    Scans src/routes/ and auto-generates src/routeTree.gen.ts
    tanstackRouter({ target: "react", routesDirectory: "./src/routes" }),

    // 2. Official React plugin (uses OXC with Vite 8)
    react(),

    // 3. Tailwind CSS v4 — Vite-native, no postcss.config needed
    tailwindcss(),
  ],
  resolve: {
    // Native Vite 8 tsconfig path alias support — replaces vite-tsconfig-paths plugin
    tsconfigPaths: true,
  },
  server: {
    port: 5173,
    // Proxy API & auth calls to NestJS backend during development.
    // The browser sends cookies to /api which forwards to localhost:3001
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
