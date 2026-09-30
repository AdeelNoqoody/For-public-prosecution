import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { NotFoundError, ValidationError, type ApiError, type DataProvider } from '@kiosk/shared';
import { z } from 'zod';
import type { ServerConfig } from './config';
import type { Database } from './db/database';
import { PaymentRepository } from './db/paymentRepository';
import { WebhookEventRepository } from './db/webhookEventRepository';
import { HttpError } from './errors';
import { PaymentEvents } from './payments/PaymentEvents';
import { PaymentService } from './payments/PaymentService';
import { PosUnavailableError, type PosProvider } from './pos';
import { registerDataRoutes } from './routes/data';
import { registerPaymentRoutes } from './routes/payments';
import { registerPaymentSocket } from './routes/ws';
import { webhookRoutes } from './routes/webhooks';

export interface AppDeps {
  config: ServerConfig;
  logger: Logger;
  db: Database;
  data: DataProvider;
  pos: PosProvider;
  now?: () => Date;
}

export interface BuiltApp {
  app: FastifyInstance;
  payments: PaymentService;
  paymentRepo: PaymentRepository;
  webhookEvents: WebhookEventRepository;
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export async function buildApp(deps: AppDeps): Promise<BuiltApp> {
  const { config, logger, db, data, pos } = deps;
  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger });

  const paymentRepo = new PaymentRepository(db);
  const webhookEvents = new WebhookEventRepository(db);
  const events = new PaymentEvents();
  const payments = new PaymentService(
    paymentRepo,
    pos,
    events,
    logger.child({ component: 'payments' }),
    {
      terminalId: config.POS_TERMINAL_ID,
      callbackUrl: `${config.PUBLIC_URL.replace(/\/+$/, '')}/webhooks/pos`,
      paymentTimeoutSeconds: config.PAYMENT_TIMEOUT_SECONDS,
      maxAmountMinor: config.MAX_PAYMENT_AMOUNT_MINOR,
      now: deps.now,
    },
  );

  await app.register(cors, {
    origin:
      config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'idempotency-key'],
  });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply
        .code(400)
        .send(errorBody('VALIDATION_ERROR', 'Invalid request', z.treeifyError(error)));
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }
    if (error instanceof NotFoundError)
      return reply.code(404).send(errorBody('NOT_FOUND', error.message));
    if (error instanceof ValidationError) {
      return reply.code(400).send(errorBody('VALIDATION_ERROR', error.message, error.details));
    }
    if (error instanceof PosUnavailableError) {
      request.log.error({ err: error }, 'POS unavailable');
      return reply.code(502).send(errorBody('POS_UNAVAILABLE', 'Payment terminal is unavailable'));
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(errorBody('BAD_REQUEST', (error as Error).message));
    }
    request.log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send(errorBody('INTERNAL_ERROR', 'Something went wrong'));
  });

  app.get('/health', async () => ({
    status: 'ok',
    dataProvider: config.DATA_PROVIDER,
    posProvider: pos.name,
    time: new Date().toISOString(),
  }));

  registerDataRoutes(app, data);
  registerPaymentRoutes(app, payments);
  registerPaymentSocket(app, payments, events);
  await app.register(webhookRoutes, { pos, payments, webhookEvents });

  if (config.NODE_ENV !== 'production') {
    // Development-only inspection endpoints.
    app.get('/api/debug/webhook-events', async () => ({ events: webhookEvents.list(50) }));
    app.get('/api/debug/payments/:paymentId/history', async (request) => {
      const { paymentId } = z.object({ paymentId: z.string() }).parse(request.params);
      return { history: paymentRepo.history(paymentId) };
    });
  }

  app.addHook('onClose', async () => payments.shutdown());

  return { app, payments, paymentRepo, webhookEvents };
}
