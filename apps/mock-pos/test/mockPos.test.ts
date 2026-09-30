import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GenericPosWebhookPayloadSchema } from '@kiosk/shared';
import { verifySignature } from '@kiosk/shared/node';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMockPos } from '../src/app';
import { planOutcome } from '../src/outcome';

const SECRET = 'mock-pos-test-secret-123';

describe('planOutcome (auto mode)', () => {
  it('derives the outcome from the amount', () => {
    expect(planOutcome('auto', 10000)).toMatchObject({ status: 'APPROVED', sendWebhook: true });
    expect(planOutcome('auto', 10001)).toMatchObject({ status: 'DECLINED', sendWebhook: true });
    expect(planOutcome('auto', 10002)).toMatchObject({ status: null, sendWebhook: false });
    expect(planOutcome('auto', 10003)).toMatchObject({ status: 'ERROR' });
    expect(planOutcome('auto', 10004)).toMatchObject({ status: 'APPROVED', sendWebhook: false });
  });

  it('honours forced modes', () => {
    expect(planOutcome('decline', 10000).status).toBe('DECLINED');
    expect(planOutcome('manual', 10000).status).toBeNull();
  });
});

describe('mock POS server', () => {
  let receiver: Server | undefined;
  let pos: Awaited<ReturnType<typeof buildMockPos>> | undefined;

  afterEach(async () => {
    await pos?.close();
    receiver?.close();
  });

  async function startReceiver(
    onWebhook: (req: IncomingMessage, body: string) => void,
  ): Promise<string> {
    receiver = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        onWebhook(req, body);
        res.writeHead(200).end('{}');
      });
    });
    await new Promise<void>((resolve) => receiver!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/webhooks/pos`;
  }

  it('accepts a transaction and later sends a correctly signed webhook', async () => {
    let resolveWebhook: (value: { signature: string; body: string }) => void;
    const webhook = new Promise<{ signature: string; body: string }>(
      (resolve) => (resolveWebhook = resolve),
    );
    const callbackUrl = await startReceiver((req, body) =>
      resolveWebhook({ signature: String(req.headers['x-signature']), body }),
    );

    pos = await buildMockPos({
      webhookSecret: SECRET,
      apiKey: 'k',
      delayMs: 20,
      outcome: 'auto',
      logLevel: 'silent',
    });
    const unauthorized = await pos.inject({ method: 'POST', url: '/transactions', payload: {} });
    expect(unauthorized.statusCode).toBe(401);

    const request = {
      amountMinor: 25000,
      currency: 'QAR',
      merchantReference: 'REF-1',
      terminalId: 'T1',
      callbackUrl,
    };
    const created = await pos.inject({
      method: 'POST',
      url: '/transactions',
      payload: request,
      headers: { authorization: 'Bearer k' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe('PENDING');

    // Idempotent on merchantReference.
    const again = await pos.inject({
      method: 'POST',
      url: '/transactions',
      payload: request,
      headers: { authorization: 'Bearer k' },
    });
    expect(again.json().transactionId).toBe(created.json().transactionId);

    const { signature, body } = await webhook;
    expect(verifySignature(body, signature, SECRET)).toEqual({ ok: true });
    const payload = GenericPosWebhookPayloadSchema.parse(JSON.parse(body));
    expect(payload).toMatchObject({
      transactionId: created.json().transactionId,
      status: 'APPROVED',
      amountMinor: 25000,
    });
    expect(payload.maskedPan).toMatch(/^\*{4} \*{4} \*{4} \d{4}$/);

    const status = await pos.inject({
      method: 'GET',
      url: `/transactions/${created.json().transactionId}`,
      headers: { authorization: 'Bearer k' },
    });
    expect(status.json().status).toBe('APPROVED');
  });

  it('cancels a pending transaction', async () => {
    const callbackUrl = await startReceiver(() => undefined);
    pos = await buildMockPos({
      webhookSecret: SECRET,
      delayMs: 10_000,
      outcome: 'manual',
      logLevel: 'silent',
    });
    const created = await pos.inject({
      method: 'POST',
      url: '/transactions',
      payload: {
        amountMinor: 100,
        currency: 'QAR',
        merchantReference: 'REF-2',
        terminalId: 'T1',
        callbackUrl,
      },
    });
    const cancelled = await pos.inject({
      method: 'POST',
      url: `/transactions/${created.json().transactionId}/cancel`,
    });
    expect(cancelled.json().status).toBe('CANCELLED');
  });
});
