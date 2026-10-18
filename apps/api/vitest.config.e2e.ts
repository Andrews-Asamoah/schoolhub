import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Native path-alias support (replaces the deprecated vite-tsconfig-paths plugin).
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
