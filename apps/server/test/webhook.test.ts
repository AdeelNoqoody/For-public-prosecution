import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, paymentRequest, signedWebhook, webhookPayload } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe('POST /webhooks/pos', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.app.close();
  });

  async function pendingPayment(amountMinor = 80000) {
    const payment = await t.payments.createPayment(paymentRequest(amountMinor));
    expect(payment.status).toBe('PENDING');
    return payment;
  }

  function payloadFor(payment: Awaited<ReturnType<typeof pendingPayment>>, overrides = {}) {
    return webhookPayload({
      transactionId: payment.posTransactionId!,
      merchantReference: payment.merchantReference,
      amountMinor: payment.amountMinor,
      ...overrides,
    });
  }

  it('applies a valid signed APPROVED webhook and stores the raw body', async () => {
    const payment = await pendingPayment();
    const payload = payloadFor(payment);
    const response = await t.app.inject(signedWebhook(payload));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, outcome: 'applied' });

    const updated = t.payments.get(payment.id);
    expect(updated.status).toBe('APPROVED');
    expect(updated.receiptNumber).toMatch(/^R\d{8}-[0-9A-F]{6}$/);
    expect(updated.authCode).toBe('123456');
    expect(updated.maskedPan).toBe('**** **** **** 1111'); // full PAN never stored

    const [event] = t.webhookEvents.list();
    expect(event).toMatchObject({
      outcome: 'applied',
      signatureValid: true,
      eventId: payload.eventId,
      paymentId: payment.id,
    });
    expect(event?.rawBody).toBe(JSON.stringify(payload));
  });

  it('is idempotent: a re-delivered event is acknowledged but changes nothing', async () => {
    const payment = await pendingPayment();
    const request = signedWebhook(payloadFor(payment));

    const first = await t.app.inject(request);
    const receipt = t.payments.get(payment.id).receiptNumber;
    const second = await t.app.inject(request);
    const third = await t.app.inject(request);

    expect(first.json().outcome).toBe('applied');
    expect(second.statusCode).toBe(200);
    expect(second.json().outcome).toBe('duplicate');
    expect(third.json().outcome).toBe('duplicate');
    expect(t.payments.get(payment.id).receiptNumber).toBe(receipt);
    // Exactly one transition into APPROVED.
    expect(t.paymentRepo.history(payment.id).filter((h) => h.toStatus === 'APPROVED')).toHaveLength(
      1,
    );
    expect(t.webhookEvents.list()).toHaveLength(3);
  });

  it('treats a retry with a new event id but the same result as a duplicate', async () => {
    const payment = await pendingPayment();
    await t.app.inject(signedWebhook(payloadFor(payment)));
    const retry = await t.app.inject(signedWebhook(payloadFor(payment)));
    expect(retry.json().outcome).toBe('duplicate');
  });

  it('never changes a final state on a conflicting webhook', async () => {
    const payment = await pendingPayment();
    await t.app.inject(signedWebhook(payloadFor(payment, { status: 'APPROVED' })));
    const conflicting = await t.app.inject(
      signedWebhook(payloadFor(payment, { status: 'DECLINED', reason: 'X' })),
    );

    expect(conflicting.json().outcome).toBe('ignored_final_state');
    expect(t.payments.get(payment.id).status).toBe('APPROVED');
  });

  it('flags a late approval after a timeout for reconciliation', async () => {
    const payment = await pendingPayment();
    t.pos.cancelOutcome = 'PENDING'; // terminal unreachable during timeout handling
    await t.payments.handleTimeout(payment.id);
    expect(t.payments.get(payment.id).status).toBe('TIMEOUT');

    const late = await t.app.inject(signedWebhook(payloadFor(payment, { status: 'APPROVED' })));
    expect(late.json().outcome).toBe('ignored_final_state');
    const record = t.payments.get(payment.id);
    expect(record.status).toBe('TIMEOUT');
    expect(record.needsReconciliation).toBe(true);
  });

  it('records a DECLINED result with its reason', async () => {
    const payment = await pendingPayment();
    await t.app.inject(
      signedWebhook(
        payloadFor(payment, { status: 'DECLINED', reason: 'INSUFFICIENT_FUNDS', authCode: null }),
      ),
    );
    const record = t.payments.get(payment.id);
    expect(record.status).toBe('DECLINED');
    expect(record.failureReason).toBe('INSUFFICIENT_FUNDS');
    expect(record.receiptNumber).toBeNull();
  });

  it('rejects an invalid signature with 401 and leaves the payment untouched', async () => {
    const payment = await pendingPayment();
    const response = await t.app.inject(
      signedWebhook(payloadFor(payment), 'wrong-secret-value-123'),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SIGNATURE_MISMATCH');
    expect(t.payments.get(payment.id).status).toBe('PENDING');
    expect(t.webhookEvents.list()[0]).toMatchObject({ outcome: 'rejected', signatureValid: false });
  });

  it('rejects a missing signature', async () => {
    const payment = await pendingPayment();
    const request = signedWebhook(payloadFor(payment));
    const response = await t.app.inject({
      ...request,
      headers: { 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('MISSING_SIGNATURE');
  });

  it('rejects a replayed (stale) webhook even if correctly signed', async () => {
    const payment = await pendingPayment();
    const stale = payloadFor(payment, {
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const response = await t.app.inject(signedWebhook(stale));
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('STALE_TIMESTAMP');
    expect(t.payments.get(payment.id).status).toBe('PENDING');
  });

  it('rejects a signed but schema-invalid payload', async () => {
    const payment = await pendingPayment();
    const response = await t.app.inject(
      signedWebhook(payloadFor(payment, { status: 'MAYBE' as never })),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PAYLOAD');
  });

  it('returns 404 for an unknown transaction', async () => {
    const response = await t.app.inject(
      signedWebhook(
        webhookPayload({
          transactionId: 'TXN-NOPE',
          merchantReference: 'REF-NOPE',
          amountMinor: 1,
        }),
      ),
    );
    expect(response.statusCode).toBe(404);
    expect(t.webhookEvents.list()[0]?.outcome).toBe('unknown_transaction');
  });

  it('turns an approval for a different amount into an ERROR needing reconciliation', async () => {
    const payment = await pendingPayment(80000);
    await t.app.inject(signedWebhook(payloadFor(payment, { amountMinor: 100 })));
    const record = t.payments.get(payment.id);
    expect(record.status).toBe('ERROR');
    expect(record.failureReason).toBe('AMOUNT_MISMATCH');
    expect(record.needsReconciliation).toBe(true);
  });

  it('pushes the result to kiosks subscribed over WebSocket', async () => {
    const payment = await pendingPayment();
    const messages: { type: string; payment?: { status: string } }[] = [];
    let resolveTwo: () => void;
    const gotTwo = new Promise<void>((resolve) => (resolveTwo = resolve));
    // Attach the listener before the handshake completes: the snapshot is sent immediately.
    const socket = await t.app.injectWS(
      `/payments/${payment.id}`,
      {},
      {
        onInit: (ws) =>
          ws.on('message', (data: Buffer) => {
            messages.push(JSON.parse(data.toString()));
            if (messages.length === 2) resolveTwo();
          }),
      },
    );
    await expect.poll(() => messages.length).toBe(1);

    await t.app.inject(signedWebhook(payloadFor(payment)));
    await gotTwo;
    socket.terminate();

    expect(messages[0]).toMatchObject({ type: 'payment.snapshot', payment: { status: 'PENDING' } });
    expect(messages[1]).toMatchObject({ type: 'payment.updated', payment: { status: 'APPROVED' } });
  });
});
