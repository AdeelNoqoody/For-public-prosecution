import type { FastifyInstance } from 'fastify';
import type { PaymentSocketMessage } from '@kiosk/shared';
import { z } from 'zod';
import { toPaymentView } from '../db/paymentRepository';
import type { PaymentEvents } from '../payments/PaymentEvents';
import type { PaymentService } from '../payments/PaymentService';

const HEARTBEAT_MS = 15_000;

/**
 * ws://server/payments/:paymentId — pushes a snapshot on connect, then every update.
 * Clients reconnect and/or GET /api/payments/:id if the socket drops.
 */
export function registerPaymentSocket(
  app: FastifyInstance,
  payments: PaymentService,
  events: PaymentEvents,
): void {
  app.get('/payments/:paymentId', { websocket: true }, (socket, request) => {
    const send = (message: PaymentSocketMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    const params = z.object({ paymentId: z.uuid() }).safeParse(request.params);
    const snapshot = params.success ? payments.find(params.data.paymentId) : undefined;
    if (!snapshot) {
      send({ type: 'error', code: 'NOT_FOUND', message: 'Payment not found' });
      socket.close(4404, 'Payment not found');
      return;
    }

    const unsubscribe = events.subscribe(snapshot.id, (view) =>
      send({ type: 'payment.updated', payment: view }),
    );
    send({ type: 'payment.snapshot', payment: toPaymentView(snapshot) });

    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, HEARTBEAT_MS);
    heartbeat.unref();

    socket.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
