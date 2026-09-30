import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end: Electron kiosk → server → mock POS → signed webhook → WebSocket → kiosk.
 * Uses dedicated ports and a throwaway database so it never touches the dev setup.
 */
export const E2E = {
  serverPort: 4610,
  posPort: 4620,
  webhookSecret: 'e2e-webhook-secret-0123456789',
  dbPath: path.join(os.tmpdir(), `kiosk-e2e-${Date.now()}.db`),
};

const common = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  LOG_FORMAT: 'json',
  POS_WEBHOOK_SECRET: E2E.webhookSecret,
  POS_API_KEY: 'e2e-api-key',
};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'npx tsx apps/mock-pos/src/index.ts',
      url: `http://127.0.0.1:${E2E.posPort}/control/state`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...common,
        MOCK_POS_PORT: String(E2E.posPort),
        MOCK_POS_DELAY_MS: '1500',
        MOCK_POS_OUTCOME: 'auto',
      },
    },
    {
      command: 'npx tsx apps/server/src/index.ts',
      url: `http://127.0.0.1:${E2E.serverPort}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...common,
        SERVER_PORT: String(E2E.serverPort),
        PUBLIC_URL: `http://127.0.0.1:${E2E.serverPort}`,
        POS_PROVIDER: 'mock',
        POS_BASE_URL: `http://127.0.0.1:${E2E.posPort}`,
        DATA_PROVIDER: 'mock',
        MOCK_LATENCY_MIN_MS: '50',
        MOCK_LATENCY_MAX_MS: '100',
        DATABASE_PATH: E2E.dbPath,
        PAYMENT_TIMEOUT_SECONDS: '30',
      },
    },
  ],
});
