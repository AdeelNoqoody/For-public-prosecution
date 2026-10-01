import { buildApp } from './app';
import { loadConfig } from './config';
import { createDataProvider } from './data';
import { openDatabase } from './db/database';
import { createLogger } from './logger';
import { createPosProvider } from './pos';
import { ReceiverPoller } from './pos/ReceiverPoller';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development' && process.env.LOG_FORMAT !== 'json',
  });
  const db = openDatabase(config.DATABASE_PATH);
  const { app, payments, paymentRepo } = await buildApp({
    config,
    logger,
    db,
    data: createDataProvider(config),
    pos: createPosProvider(config, logger),
  });

  // Poll the public webhook-receiver for card results and push them to the kiosk.
  let receiverPoller: ReceiverPoller | undefined;
  if (config.RECEIVER_URL) {
    receiverPoller = new ReceiverPoller(
      paymentRepo,
      payments,
      {
        baseUrl: config.RECEIVER_URL,
        intervalMs: config.RECEIVER_POLL_INTERVAL_MS,
        requestTimeoutMs: config.POS_REQUEST_TIMEOUT_MS,
      },
      logger.child({ component: 'receiver-poller' }),
    );
    receiverPoller.start();
  }

  await app.listen({ port: config.SERVER_PORT, host: config.SERVER_HOST });
  payments.resumePending();
  logger.info(
    {
      dataProvider: config.DATA_PROVIDER,
      posProvider: config.POS_PROVIDER,
      publicUrl: config.PUBLIC_URL,
    },
    'Kiosk server ready',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    receiverPoller?.stop();
    await app.close();
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
