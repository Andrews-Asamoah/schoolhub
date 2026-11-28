import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    // 1. TanStack Router — must come BEFORE the React plugin
    //    Scans src/routes/ and auto-generates src/routeTree.gen.ts
    tanstackRouter({ target: "react", routesDirectory: "./src/routes", autoCodeSplitting: true }),

    // 2. Official React plugin (uses OXC with Vite 8)
    react(),

    // 3. Tailwind CSS v4 — Vite-native, no postcss.config needed
    tailwindcss(),
  ],
  resolve: {
    // Native Vite 8 tsconfig path alias support — replaces vite-tsconfig-paths plugin
    tsconfigPaths: true,
  },
  build: {
    // Hidden source maps are uploaded to the error tracker by CI and never referenced by the served files.
    sourcemap: "hidden",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Tiny helpers used by every component. Without their own group they were folded into the
            // recharts chunk, which then had to load on every page.
            { name: "ui-helpers", test: /node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/, priority: 40 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: "tanstack", test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
            { name: "recharts", test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/, priority: 10 },
          ],
        },
      },
    },
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
