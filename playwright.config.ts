import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173',
  },
  // Set BASE_URL to test a running server (for example a local `wrangler dev` of the deploy worker).
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
});
