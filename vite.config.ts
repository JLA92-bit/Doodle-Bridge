/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'], matter: ['matter-js'] },
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/*.test.ts'],
    environment: 'node',
    // The transformed-module cache keeps old import.meta.glob results, so new level files
    // would be silently skipped by the solver test. Always transform fresh.
    fsModuleCache: false,
  },
});