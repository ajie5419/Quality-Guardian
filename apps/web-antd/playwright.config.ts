import process from 'node:process';

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.QGS_E2E_BASE_URL;
if (
  process.env.QGS_E2E_MODE !== 'isolated' ||
  !baseURL ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL) ||
  !process.env.QGS_E2E_ARTIFACT_DIR
) {
  throw new Error(
    'Use pnpm test:e2e: standalone or shared targets are forbidden',
  );
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  // 58 sequential browser tests legitimately take ~500s on an idle machine;
  // 900s prevents false timeouts under normal desktop load.
  globalTimeout: 900_000,
  expect: { timeout: 15_000 },
  outputDir: `${process.env.QGS_E2E_ARTIFACT_DIR}/test-results`,
  reporter: [['./e2e/reporter.ts']],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    baseURL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1000 },
    // Default stays safe: raw traces contain passwords, cookies and bearer tokens.
    // Opt in with QGS_E2E_TRACE=1 only to debug hard-to-reproduce flakes; the
    // resulting trace files are credential-bearing, so keep them in an isolated
    // temporary environment, local to your machine, and never share them.
    trace: process.env.QGS_E2E_TRACE === '1' ? 'retain-on-failure' : 'off',
    // Screenshots are captured with masking by the specs themselves.
    screenshot: 'off',
    video: 'off',
  },
});
