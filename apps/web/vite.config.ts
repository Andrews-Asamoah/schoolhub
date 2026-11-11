import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const desktop = process.env.VITE_TARGET === "desktop";
const platformPath = fileURLToPath(
  new URL(
    desktop
      ? "./src/lib/platform/desktop/index.ts"
      : "./src/lib/platform/web.ts",
    import.meta.url,
  ),
);

export default defineConfig({
  plugins: [
    // 1. TanStack Router — must come BEFORE the React plugin
    //    Scans src/routes/ and auto-generates src/routeTree.gen.ts
    tanstackRouter({
      target: "react",
      routesDirectory: "./src/routes",
      ...(desktop
        ? {
            generatedRouteTree: "./src/generated/routeTree.desktop.gen.ts",
            routeFileIgnorePattern: "(^|/)(admin|apply)(/|\\.|$)",
          }
        : {}),
    }),
    ...[
      {
        name: "desktop-boundaries",
        enforce: "pre" as const,
        resolveId(source: string, importer?: string) {
          if (
            desktop &&
            source === "./routeTree.gen" &&
            importer?.endsWith("/src/main.tsx")
          ) {
            return fileURLToPath(
              new URL(
                "./src/generated/routeTree.desktop.gen.ts",
                import.meta.url,
              ),
            );
          }
        },
        generateBundle(
          _options: unknown,
          bundle: Record<
            string,
            { type: string; modules?: Record<string, unknown> }
          >,
        ) {
          for (const chunk of Object.values(bundle)) {
            for (const id of Object.keys(chunk.modules ?? {})) {
              if (
                desktop &&
                /\/src\/(routes\/admin(?:\/|\.)|routes\/apply(?:\/|\.)|components\/superadmin\/)/.test(
                  id.replaceAll("\\", "/"),
                )
              ) {
                throw new Error(
                  `Web-only module reached the desktop bundle: ${id}`,
                );
              }
              if (
                !desktop &&
                (id.includes("/lib/platform/desktop/") ||
                  id.includes("/@tauri-apps/api/"))
              ) {
                throw new Error(`Native module reached the web bundle: ${id}`);
              }
            }
          }
        },
      },
    ],

    // 2. Official React plugin (uses OXC with Vite 8)
    react(),

    // 3. Tailwind CSS v4 — Vite-native, no postcss.config needed
    tailwindcss(),
  ],
  resolve: {
    // Native Vite 8 tsconfig path alias support — replaces vite-tsconfig-paths plugin
    tsconfigPaths: true,
    alias: { "@schoolhub/platform": platformPath },
  },
  build: desktop ? { outDir: "dist-desktop", sourcemap: false } : {},
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
