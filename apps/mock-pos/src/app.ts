import { randomBytes, randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  GenericPosCreateTransactionRequestSchema,
  PosResultStatusSchema,
  SIGNATURE_HEADER,
  type GenericPosTransaction,
  type GenericPosWebhookPayload,
  type PosResultStatus,
} from '@kiosk/shared';
import { signPayload } from '@kiosk/shared/node';
import { z } from 'zod';
import { CONTROL_PAGE_HTML } from './controlPage';
import { OUTCOME_MODES, planOutcome, type OutcomeMode } from './outcome';

export interface MockPosConfig {
  webhookSecret: string;
  /** If set, requests must send `Authorization: Bearer <apiKey>`. */
  apiKey?: string;
  delayMs: number;
  outcome: OutcomeMode;
  logLevel?: string;
  webhookRetryDelaysMs?: number[];
}

interface StoredTransaction extends GenericPosTransaction {
  callbackUrl: string;
  webhooksSent: number;
  lastWebhookStatus: number | null;
  timer?: NodeJS.Timeout;
}

const TEST_CARDS = [
  { scheme: 'VISA', last4: '1111' },
  { scheme: 'MASTERCARD', last4: '4444' },
  { scheme: 'AMEX', last4: '0005' },
];

function publicView(tx: StoredTransaction): GenericPosTransaction & {
  webhooksSent: number;
  lastWebhookStatus: number | null;
} {
  const { timer: _timer, callbackUrl: _callbackUrl, ...rest } = tx;
  return rest;
}

export async function buildMockPos(config: MockPosConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel ?? 'info' } });
  const transactions = new Map<string, StoredTransaction>();
  const byReference = new Map<string, string>();
  const settings = { outcome: config.outcome, delayMs: config.delayMs };
  const retryDelays = config.webhookRetryDelaysMs ?? [1000, 3000, 10000];

  const requireApiKey = (authorization: string | undefined) =>
    !config.apiKey || authorization === `Bearer ${config.apiKey}`;

  async function sendWebhook(tx: StoredTransaction): Promise<void> {
    if (tx.status === 'PENDING') return;
    const payload: GenericPosWebhookPayload = {
      eventId: `evt_${randomUUID()}`,
      transactionId: tx.transactionId,
      merchantReference: tx.merchantReference,
      status: tx.status,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      authCode: tx.authCode ?? null,
      maskedPan: tx.maskedPan ?? null,
      cardScheme: tx.cardScheme ?? null,
      reason: tx.reason ?? null,
      timestamp: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);
    const signature = signPayload(body, config.webhookSecret);

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await fetch(tx.callbackUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        tx.webhooksSent += 1;
        tx.lastWebhookStatus = response.status;
        app.log.info(
          { transactionId: tx.transactionId, status: response.status, attempt },
          'Webhook delivered',
        );
        // Retry only on server errors, like most providers do.
        if (response.status < 500) return;
      } catch (error) {
        app.log.warn(
          { transactionId: tx.transactionId, attempt, err: error },
          'Webhook delivery failed',
        );
      }
      const delay = retryDelays[attempt];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  function complete(
    tx: StoredTransaction,
    status: PosResultStatus,
    options: { reason?: string | null; sendWebhook: boolean },
  ): void {
    if (tx.status !== 'PENDING') return;
    if (tx.timer) clearTimeout(tx.timer);
    tx.timer = undefined;
    tx.status = status;
    tx.updatedAt = new Date().toISOString();
    tx.reason = status === 'APPROVED' ? null : (options.reason ?? status);
    if (status === 'APPROVED' || status === 'DECLINED') {
      const card = TEST_CARDS[Math.floor(Math.random() * TEST_CARDS.length)] ?? {
        scheme: 'VISA',
        last4: '1111',
      };
      tx.cardScheme = card.scheme;
      tx.maskedPan = `**** **** **** ${card.last4}`;
    }
    if (status === 'APPROVED') {
      tx.authCode = String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
    }
    app.log.info(
      { transactionId: tx.transactionId, status, sendWebhook: options.sendWebhook },
      'Transaction completed',
    );
    if (options.sendWebhook) void sendWebhook(tx);
  }

  const findTx = (id: string) => transactions.get(id);

  /* ─── Provider API ──────────────────────────────────────────── */

  app.post('/transactions', async (request, reply) => {
    if (!requireApiKey(request.headers.authorization)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = GenericPosCreateTransactionRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
    const input = parsed.data;

    // Idempotent on merchantReference.
    const existingId = byReference.get(input.merchantReference);
    const existing = existingId ? transactions.get(existingId) : undefined;
    if (existing) return reply.code(200).send(publicView(existing));

    const now = new Date().toISOString();
    const tx: StoredTransaction = {
      transactionId: `TXN-${randomBytes(6).toString('hex').toUpperCase()}`,
      merchantReference: input.merchantReference,
      terminalId: input.terminalId,
      status: 'PENDING',
      amountMinor: input.amountMinor,
      currency: input.currency,
      authCode: null,
      maskedPan: null,
      cardScheme: null,
      reason: null,
      createdAt: now,
      updatedAt: now,
      callbackUrl: input.callbackUrl,
      webhooksSent: 0,
      lastWebhookStatus: null,
    };
    transactions.set(tx.transactionId, tx);
    byReference.set(tx.merchantReference, tx.transactionId);

    const plan = planOutcome(settings.outcome, tx.amountMinor);
    app.log.info(
      { transactionId: tx.transactionId, amountMinor: tx.amountMinor, plan },
      'Transaction accepted',
    );
    if (plan.status) {
      const status = plan.status;
      tx.timer = setTimeout(
        () => complete(tx, status, { reason: plan.reason, sendWebhook: plan.sendWebhook }),
        settings.delayMs,
      );
    }
    return reply.code(201).send(publicView(tx));
  });

  app.get('/transactions/:id', async (request, reply) => {
    if (!requireApiKey(request.headers.authorization))
      return reply.code(401).send({ error: 'unauthorized' });
    const tx = findTx((request.params as { id: string }).id);
    if (!tx) return reply.code(404).send({ error: 'not_found' });
    return publicView(tx);
  });

  app.post('/transactions/:id/cancel', async (request, reply) => {
    if (!requireApiKey(request.headers.authorization))
      return reply.code(401).send({ error: 'unauthorized' });
    const tx = findTx((request.params as { id: string }).id);
    if (!tx) return reply.code(404).send({ error: 'not_found' });
    complete(tx, 'CANCELLED', { reason: 'CANCELLED_BY_MERCHANT', sendWebhook: true });
    return publicView(tx);
  });

  /* ─── Manual control (for the tiny web page) ────────────────── */

  app.get('/', async (_request, reply) =>
    reply.type('text/html; charset=utf-8').send(CONTROL_PAGE_HTML),
  );

  app.get('/control/state', async () => ({
    settings,
    transactions: [...transactions.values()].reverse().slice(0, 50).map(publicView),
  }));

  app.post('/control/settings', async (request) => {
    const body = z
      .object({
        outcome: z.enum(OUTCOME_MODES).optional(),
        delayMs: z.number().int().min(0).max(600_000).optional(),
      })
      .parse(request.body);
    if (body.outcome) settings.outcome = body.outcome;
    if (body.delayMs !== undefined) settings.delayMs = body.delayMs;
    return { settings };
  });

  app.post('/control/transactions/:id/complete', async (request, reply) => {
    const tx = findTx((request.params as { id: string }).id);
    if (!tx) return reply.code(404).send({ error: 'not_found' });
    const body = z
      .object({
        status: PosResultStatusSchema,
        reason: z.string().optional(),
        sendWebhook: z.boolean().default(true),
      })
      .parse(request.body);
    if (tx.status !== 'PENDING')
      return reply.code(409).send({ error: 'already_final', transaction: publicView(tx) });
    complete(tx, body.status, { reason: body.reason, sendWebhook: body.sendWebhook });
    return publicView(tx);
  });

  app.post('/control/transactions/:id/resend-webhook', async (request, reply) => {
    const tx = findTx((request.params as { id: string }).id);
    if (!tx) return reply.code(404).send({ error: 'not_found' });
    if (tx.status === 'PENDING') return reply.code(409).send({ error: 'still_pending' });
    await sendWebhook(tx);
    return publicView(tx);
  });

  app.addHook('onClose', async () => {
    for (const tx of transactions.values()) if (tx.timer) clearTimeout(tx.timer);
  });

  return app;
}
