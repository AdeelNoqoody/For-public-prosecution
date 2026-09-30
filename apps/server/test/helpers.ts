import { randomUUID } from 'node:crypto';
import pino from 'pino';
import type {
  CreatePaymentRequest,
  GenericPosWebhookPayload,
  PosResultStatus,
} from '@kiosk/shared';
import { signPayload } from '@kiosk/shared/node';
import { buildApp } from '../src/app';
import { parseConfig } from '../src/config';
import { MockDataProvider } from '../src/data/MockDataProvider';
import { openDatabase } from '../src/db/database';
import { MockPosProvider } from '../src/pos/MockPosProvider';
import type { PosCreateTransactionInput, PosTransaction } from '../src/pos';

export const WEBHOOK_SECRET = 'unit-test-webhook-secret';
export const silentLogger = pino({ level: 'silent' });

/**
 * In-memory POS: no network, fully controllable. Webhook parsing (signature, replay window,
 * schema) is inherited unchanged from MockPosProvider, so webhook tests exercise real code.
 */
export class FakePosProvider extends MockPosProvider {
  readonly transactions = new Map<string, PosTransaction>();
  readonly calls = { create: 0, get: 0, cancel: 0 };
  failCreate = false;
  /** What the POS reports after a cancel request for a PENDING transaction. */
  cancelOutcome: 'CANCELLED' | 'PENDING' = 'CANCELLED';

  constructor() {
    super(
      {
        baseUrl: 'http://fake-pos.invalid',
        apiKey: '',
        webhookSecret: WEBHOOK_SECRET,
        webhookToleranceSeconds: 300,
        requestTimeoutMs: 1000,
      },
      silentLogger,
    );
  }

  override async createTransaction(input: PosCreateTransactionInput): Promise<PosTransaction> {
    this.calls.create += 1;
    if (this.failCreate) throw new Error('POS down');
    const tx: PosTransaction = {
      transactionId: `TXN-${this.transactions.size + 1}`,
      merchantReference: input.merchantReference,
      status: 'PENDING',
      amountMinor: input.amountMinor,
      currency: input.currency,
    };
    this.transactions.set(tx.transactionId, tx);
    return { ...tx };
  }

  override async getTransaction(transactionId: string): Promise<PosTransaction> {
    this.calls.get += 1;
    return { ...this.mustGet(transactionId) };
  }

  override async cancelTransaction(transactionId: string): Promise<PosTransaction> {
    this.calls.cancel += 1;
    const tx = this.mustGet(transactionId);
    if (tx.status === 'PENDING' && this.cancelOutcome === 'CANCELLED') tx.status = 'CANCELLED';
    return { ...tx };
  }

  /** Simulates the terminal finishing without (yet) sending a webhook. */
  complete(
    transactionId: string,
    status: PosResultStatus,
    extra: Partial<PosTransaction> = {},
  ): void {
    Object.assign(this.mustGet(transactionId), { status, ...extra });
  }

  private mustGet(transactionId: string): PosTransaction {
    const tx = this.transactions.get(transactionId);
    if (!tx) throw new Error(`Unknown transaction ${transactionId}`);
    return tx;
  }
}

export async function createTestApp(env: Record<string, string> = {}) {
  const config = parseConfig({
    NODE_ENV: 'test',
    POS_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PUBLIC_URL: 'http://kiosk-server.test',
    PAYMENT_TIMEOUT_SECONDS: '60',
    MAX_PAYMENT_AMOUNT_MINOR: '0',
    ...env,
  });
  const db = openDatabase(':memory:');
  const pos = new FakePosProvider();
  const built = await buildApp({
    config,
    logger: silentLogger,
    db,
    data: new MockDataProvider({ latencyMinMs: 0, latencyMaxMs: 0 }),
    pos,
  });
  await built.app.ready();
  return { ...built, pos, db, config };
}

export function paymentRequest(amountMinor = 80000): CreatePaymentRequest {
  return {
    kioskId: 'KIOSK-TEST',
    currency: 'QAR',
    amountMinor,
    items: [
      {
        id: 'V-1',
        kind: 'VIOLATION',
        description: { en: 'Speeding', ar: 'سرعة' },
        amountMinor,
        currency: 'QAR',
      },
    ],
  };
}

export function webhookPayload(
  overrides: Partial<GenericPosWebhookPayload> &
    Pick<GenericPosWebhookPayload, 'transactionId' | 'merchantReference' | 'amountMinor'>,
): GenericPosWebhookPayload {
  return {
    eventId: `evt_${randomUUID()}`,
    status: 'APPROVED',
    currency: 'QAR',
    authCode: '123456',
    maskedPan: '4111111111111111', // deliberately unmasked: the server must mask it
    cardScheme: 'VISA',
    reason: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function signedWebhook(payload: GenericPosWebhookPayload, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  return {
    method: 'POST' as const,
    url: '/webhooks/pos',
    headers: { 'content-type': 'application/json', 'x-signature': signPayload(body, secret) },
    payload: body,
  };
}
