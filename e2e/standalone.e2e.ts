import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const KIOSK_DIR = path.resolve(__dirname, '../apps/kiosk');

/**
 * Standalone desktop mode: the app starts its own embedded server + mock POS
 * (no external processes), exactly like the installed Windows app.
 */
test('standalone app runs its own backend and completes a payment', async () => {
  const app = await electron.launch({
    args: [KIOSK_DIR, '--embedded'],
    cwd: KIOSK_DIR,
    env: {
      ...process.env,
      KIOSK_WINDOW_MODE: 'window',
      SERVER_PORT: '4710',
      MOCK_POS_PORT: '4720',
      POS_PROVIDER: 'mock',
      POS_BASE_URL: 'http://127.0.0.1:4720',
      PUBLIC_URL: 'http://127.0.0.1:4710',
      MOCK_POS_DELAY_MS: '1000',
      MOCK_POS_OUTCOME: 'auto',
      LOG_LEVEL: 'warn',
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId('start-button')).toBeVisible({ timeout: 30_000 });

    // The embedded backend answers on the configured local port.
    const health = await fetch('http://127.0.0.1:4710/health');
    expect(health.ok).toBe(true);

    await page.getByTestId('start-button').click();
    await page.getByTestId('service-traffic-violations').click();
    for (const digit of '777') await page.getByTestId(`key-${digit}`).click();
    await page.getByTestId('plate-search').click();
    await expect(page.getByTestId('total-amount')).toContainText('1.00');
    await page.getByTestId('pay-selected').click();
    await page.getByTestId('pay-by-card').click();

    const result = page.getByTestId('payment-result');
    await expect(result).toHaveAttribute('data-status', 'APPROVED', { timeout: 20_000 });
    await expect(page.getByTestId('result-title')).toHaveText('Payment successful');
  } finally {
    await app.close();
  }
});
