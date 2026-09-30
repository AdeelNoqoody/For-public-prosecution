import type { FastifyInstance } from 'fastify';
import { CreatePaymentRequestSchema, type CreatePaymentResponse } from '@kiosk/shared';
import { z } from 'zod';
import { toPaymentView } from '../db/paymentRepository';
import type { PaymentService } from '../payments/PaymentService';

const ParamsSchema = z.object({ paymentId: z.uuid() });
const IdempotencyKeySchema = z.string().min(8).max(128).optional();

export function registerPaymentRoutes(app: FastifyInstance, payments: PaymentService): void {
  app.post('/api/payments', async (request, reply) => {
    const body = CreatePaymentRequestSchema.parse(request.body);
    const idempotencyKey = IdempotencyKeySchema.parse(request.headers['idempotency-key']);
    const payment = await payments.createPayment(body, idempotencyKey);
    const response: CreatePaymentResponse = {
      paymentId: payment.id,
      payment: toPaymentView(payment),
    };
    return reply.code(201).send(response);
  });

  app.get('/api/payments/:paymentId', async (request) => {
    const { paymentId } = ParamsSchema.parse(request.params);
    return toPaymentView(payments.get(paymentId));
  });

  app.post('/api/payments/:paymentId/cancel', async (request) => {
    const { paymentId } = ParamsSchema.parse(request.params);
    return toPaymentView(await payments.cancel(paymentId));
  });
}
