import { defineConfig } from '@playwright/test';
import fs from 'fs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  testDir: './tests',
  // The suite is one business chain (CRM -> Deposit -> TDR -> Loan -> Batch -> Txn);
  // each spec depends on records created by the previous one, so run strictly in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.CIIHIVE_URL ?? 'https://fmfi.ciihive.com',
    headless: process.env.HEADED !== '1',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
