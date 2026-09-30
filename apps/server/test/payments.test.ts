import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, paymentRequest } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe('payments', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.app.close();
  });

  it('creates a PENDING payment via the API and sends it to the POS with the callback URL', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/payments',
      payload: paymentRequest(),
    });
    expect(response.statusCode).toBe(201);
    const { paymentId, payment } = response.json();
    expect(payment).toMatchObject({
      paymentId,
      status: 'PENDING',
      amountMinor: 80000,
      posTransactionId: 'TXN-1',
    });
    expect(Date.parse(payment.expiresAt) - Date.parse(payment.createdAt)).toBeGreaterThanOrEqual(
      59_000,
    );
    expect(t.pos.calls.create).toBe(1);

    const fetched = await t.app.inject({ method: 'GET', url: `/api/payments/${paymentId}` });
    expect(fetched.json().status).toBe('PENDING');
  });

  it('validates the request body', async () => {
    const bad = { ...paymentRequest(), amountMinor: 1 };
    const response = await t.app.inject({ method: 'POST', url: '/api/payments', payload: bad });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(t.pos.calls.create).toBe(0);
  });

  it('de-duplicates by Idempotency-Key', async () => {
    const headers = { 'idempotency-key': 'key-1234567890' };
    const first = await t.app.inject({
      method: 'POST',
      url: '/api/payments',
      payload: paymentRequest(),
      headers,
    });
    const second = await t.app.inject({
      method: 'POST',
      url: '/api/payments',
      payload: paymentRequest(),
      headers,
    });
    expect(second.json().paymentId).toBe(first.json().paymentId);
    expect(t.pos.calls.create).toBe(1);

    const reused = await t.app.inject({
      method: 'POST',
      url: '/api/payments',
      payload: paymentRequest(5000),
      headers,
    });
    expect(reused.statusCode).toBe(409);
  });

  it('marks the payment ERROR when the POS cannot be reached', async () => {
    t.pos.failCreate = true;
    const payment = await t.payments.createPayment(paymentRequest());
    expect(payment.status).toBe('ERROR');
    expect(payment.failureReason).toBe('POS_UNAVAILABLE');
  });

  it('cancels a pending payment at the POS', async () => {
    const payment = await t.payments.createPayment(paymentRequest());
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/payments/${payment.id}/cancel`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('CANCELLED');
    expect(t.pos.calls.cancel).toBe(1);
  });

  it('keeps waiting when the POS accepts a cancel asynchronously', async () => {
    t.pos.cancelOutcome = 'PENDING';
    const payment = await t.payments.createPayment(paymentRequest());
    const cancelled = await t.payments.cancel(payment.id);
    expect(cancelled.status).toBe('PENDING');
  });

  it('does not cancel a payment the terminal already approved', async () => {
    const payment = await t.payments.createPayment(paymentRequest());
    t.pos.complete(payment.posTransactionId!, 'APPROVED', { authCode: '999999' });
    const result = await t.payments.cancel(payment.id);
    expect(result.status).toBe('APPROVED');
  });

  describe('timeout fallback', () => {
    it('polls the POS and applies a result whose webhook was lost', async () => {
      const payment = await t.payments.createPayment(paymentRequest());
      t.pos.complete(payment.posTransactionId!, 'APPROVED', {
        authCode: '654321',
        maskedPan: '**** **** **** 4444',
      });

      await t.payments.handleTimeout(payment.id);

      const record = t.payments.get(payment.id);
      expect(record.status).toBe('APPROVED');
      expect(record.authCode).toBe('654321');
      expect(t.pos.calls.get).toBe(1);
      expect(t.pos.calls.cancel).toBe(0);
      expect(t.paymentRepo.history(payment.id).at(-1)).toMatchObject({
        toStatus: 'APPROVED',
        source: 'poll',
      });
    });

    it('cancels at the terminal and marks TIMEOUT when still pending', async () => {
      const payment = await t.payments.createPayment(paymentRequest());
      await t.payments.handleTimeout(payment.id);
      const record = t.payments.get(payment.id);
      expect(record.status).toBe('TIMEOUT');
      expect(record.failureReason).toBe('NO_RESPONSE_FROM_TERMINAL');
      expect(t.pos.calls.cancel).toBe(1);
    });

    it('fires automatically after PAYMENT_TIMEOUT_SECONDS', async () => {
      const fast = await createTestApp({ PAYMENT_TIMEOUT_SECONDS: '1' });
      try {
        const payment = await fast.payments.createPayment(paymentRequest());
        await new Promise((resolve) => setTimeout(resolve, 1300));
        expect(fast.payments.get(payment.id).status).toBe('TIMEOUT');
      } finally {
        await fast.app.close();
      }
    });

    it('is a no-op for payments that already completed', async () => {
      const payment = await t.payments.createPayment(paymentRequest());
      await t.payments.cancel(payment.id);
      await t.payments.handleTimeout(payment.id);
      expect(t.payments.get(payment.id).status).toBe('CANCELLED');
    });
  });

  it('fails payments interrupted mid-creation on restart and flags them', async () => {
    const payment = await t.payments.createPayment(paymentRequest());
    // Simulate a crash between inserting the record and the POS accepting it.
    t.db.prepare(`UPDATE payments SET status = 'CREATED' WHERE id = ?`).run(payment.id);
    t.payments.resumePending();
    const record = t.payments.get(payment.id);
    expect(record.status).toBe('ERROR');
    expect(record.failureReason).toBe('INTERRUPTED');
    expect(record.needsReconciliation).toBe(true);
  });
});

describe('payment amount limit (live POS demo)', () => {
  it('rejects anything above MAX_PAYMENT_AMOUNT_MINOR before calling the POS', async () => {
    const t = await createTestApp({ MAX_PAYMENT_AMOUNT_MINOR: '100' });
    try {
      const over = await t.app.inject({
        method: 'POST',
        url: '/api/payments',
        payload: paymentRequest(101),
      });
      expect(over.statusCode).toBe(400);
      expect(over.json().error.code).toBe('AMOUNT_LIMIT_EXCEEDED');
      expect(t.pos.calls.create).toBe(0);

      const ok = await t.app.inject({
        method: 'POST',
        url: '/api/payments',
        payload: paymentRequest(100),
      });
      expect(ok.statusCode).toBe(201);
    } finally {
      await t.app.close();
    }
  });
});
