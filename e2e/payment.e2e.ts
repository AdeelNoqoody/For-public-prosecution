import path from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { E2E } from '../playwright.config';

const KIOSK_DIR = path.resolve(__dirname, '../apps/kiosk');
const POS_URL = `http://127.0.0.1:${E2E.posPort}`;

let app: ElectronApplication;
let page: Page;

async function setPosOutcome(outcome: 'auto' | 'decline') {
  const response = await fetch(`${POS_URL}/control/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
  expect(response.ok).toBe(true);
}

async function payTrafficViolations(plate: string) {
  await page.getByTestId('start-button').click();
  await page.getByTestId('service-traffic-violations').click();
  await page.getByTestId('plate-type-PRIVATE').click();
  for (const digit of plate) await page.getByTestId(`key-${digit}`).click();
  await expect(page.getByTestId('plate-display')).toHaveText(new RegExp(plate));
  await page.getByTestId('plate-search').click();

  // Static mock result: same vehicle and violations for any plate.
  await expect(page.getByTestId('vehicle-make')).toHaveText('Toyota Land Cruiser');
  await expect(page.getByTestId('plate-badge')).toContainText(plate);
  await expect(page.getByTestId('violations').getByRole('checkbox')).toHaveCount(4);

  // Deselect one violation: total must follow the selection (4 × 0.25 − 0.25 = 0.75 QAR).
  await page.getByTestId('violation-V-2026-118907').click();
  await expect(page.getByTestId('total-amount')).toContainText('0.75');
  await page.getByTestId('pay-selected').click();

  await expect(page.getByTestId('summary-items').locator('li')).toHaveCount(3);
  await page.getByTestId('pay-by-card').click();
  await expect(page.getByTestId('payment-waiting')).toBeVisible();
  await expect(page.getByTestId('waiting-amount')).toContainText('0.75');
}

test.beforeEach(async () => {
  app = await electron.launch({
    args: [KIOSK_DIR],
    cwd: KIOSK_DIR,
    env: {
      ...process.env,
      KIOSK_SERVER_URL: `http://127.0.0.1:${E2E.serverPort}`,
      KIOSK_ID: 'KIOSK-E2E',
      KIOSK_MODE: 'false',
    },
  });
  page = await app.firstWindow();
  await expect(page.getByTestId('start-button')).toBeVisible({ timeout: 30_000 });
});

test.afterEach(async () => {
  await app?.close();
  await setPosOutcome('auto');
});

test('pays traffic violations end to end and shows the receipt', async () => {
  await payTrafficViolations('123');

  // Mock POS approves after ~1.5s and sends a signed webhook; the server pushes it over WebSocket.
  const result = page.getByTestId('payment-result');
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toHaveAttribute('data-status', 'APPROVED');
  await expect(page.getByTestId('result-title')).toHaveText('Payment successful');
  await expect(result).toContainText(/R\d{8}-[0-9A-F]{6}/); // receipt number
  await expect(result).toContainText(/TXN-[0-9A-F]{12}/); // POS transaction id

  // Done returns to a fresh session.
  await page.getByTestId('result-done').click();
  await expect(page.getByTestId('start-button')).toBeVisible();
});

test('shows a declined result with a retry option', async () => {
  await setPosOutcome('decline');
  await payTrafficViolations('4567');

  const result = page.getByTestId('payment-result');
  await expect(result).toHaveAttribute('data-status', 'DECLINED', { timeout: 20_000 });
  await expect(result).toContainText('insufficient funds');
  await expect(page.getByTestId('result-retry')).toBeVisible();
});

test('switches to Arabic with right-to-left layout', async () => {
  await page.getByTestId('language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.stage')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('start-button')).toHaveText('اضغط للبدء');
});
