import type { FastifyInstance } from 'fastify';
import type { WebhookEventRepository } from '../db/webhookEventRepository';
import type { PaymentService } from '../payments/PaymentService';
import { WebhookRejectedError, type PosProvider } from '../pos';

/** Headers worth keeping in the audit log. Never store auth headers. */
const LOGGED_HEADERS = [
  'content-type',
  'user-agent',
  'x-signature',
  'x-request-id',
  'x-forwarded-for',
];

/**
 * POST /webhooks/pos — result notifications from the POS provider.
 * Registered in its own scope so the body arrives as a raw Buffer (needed for HMAC).
 */
export async function webhookRoutes(
  app: FastifyInstance,
  opts: { pos: PosProvider; payments: PaymentService; webhookEvents: WebhookEventRepository },
): Promise<void> {
  const { pos, payments, webhookEvents } = opts;

  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 64 * 1024 }, (_req, body, done) =>
    done(null, body),
  );

  app.post('/webhooks/pos', async (request, reply) => {
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const headers: Record<string, string> = {};
    for (const name of LOGGED_HEADERS) {
      const value = request.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const rowId = webhookEvents.insert({
      receivedAt: new Date().toISOString(),
      provider: pos.name,
      headers,
      rawBody: rawBody.toString('utf8'),
    });

    let event;
    try {
      event = pos.parseWebhook(rawBody, request.headers);
    } catch (error) {
      if (error instanceof WebhookRejectedError) {
        request.log.warn({ code: error.code, webhookRowId: rowId }, 'Webhook rejected');
        webhookEvents.update(rowId, {
          outcome: 'rejected',
          signatureValid: error.signatureValid,
          error: error.code,
        });
        return reply
          .code(error.httpStatus)
          .send({ error: { code: error.code, message: 'Webhook rejected' } });
      }
      webhookEvents.update(rowId, { outcome: 'failed', error: String(error) });
      throw error;
    }

    const base = {
      signatureValid: true,
      eventId: event.eventId,
      posTransactionId: event.transactionId,
    };
    if (webhookEvents.wasProcessed(event.eventId, rowId)) {
      webhookEvents.update(rowId, { ...base, outcome: 'duplicate' });
      request.log.info({ eventId: event.eventId }, 'Duplicate webhook event ignored');
      return { received: true, outcome: 'duplicate' };
    }

    const result = payments.applyWebhook(event);
    webhookEvents.update(rowId, {
      ...base,
      outcome: result.outcome,
      paymentId: result.payment?.id,
    });
    request.log.info(
      {
        eventId: event.eventId,
        status: event.status,
        outcome: result.outcome,
        paymentId: result.payment?.id,
      },
      'Webhook processed',
    );
    if (result.outcome === 'unknown_transaction') {
      return reply
        .code(404)
        .send({ error: { code: 'UNKNOWN_TRANSACTION', message: 'Unknown transaction' } });
    }
    return { received: true, outcome: result.outcome };
  });
}
