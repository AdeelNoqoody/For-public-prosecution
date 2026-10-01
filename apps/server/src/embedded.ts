import { buildApp } from './app';
import { parseConfig } from './config';
import { createDataProvider } from './data';
import { openDatabase } from './db/database';
import { createLogger } from './logger';
import { createPosProvider } from './pos';
import { ReceiverPoller } from './pos/ReceiverPoller';

export interface EmbeddedServerOptions {
  /** Environment-style settings (kiosk.env + defaults). */
  env: Record<string, string | undefined>;
  databasePath: string;
  logFile?: string;
}

export interface EmbeddedServer {
  url: string;
  close(): Promise<void>;
}

/**
 * Starts the kiosk backend inside another process (the Electron desktop app), so the
 * installed app runs standalone without a separately started server.
 */
export async function startEmbeddedServer(options: EmbeddedServerOptions): Promise<EmbeddedServer> {
  const config = parseConfig({ ...options.env, DATABASE_PATH: options.databasePath });
  const logger = createLogger({ level: config.LOG_LEVEL, file: options.logFile });
  const db = openDatabase(config.DATABASE_PATH);
  const { app, payments, paymentRepo } = await buildApp({
    config,
    logger,
    db,
    data: createDataProvider(config),
    pos: createPosProvider(config, logger),
  });
  await app.listen({ port: config.SERVER_PORT, host: config.SERVER_HOST });
  payments.resumePending();

  // Poll the public webhook-receiver for card results and push them to the kiosk UI.
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
  logger.info(
    {
      dataProvider: config.DATA_PROVIDER,
      posProvider: config.POS_PROVIDER,
      port: config.SERVER_PORT,
    },
    'Embedded kiosk server ready',
  );
  return {
    url: `http://127.0.0.1:${config.SERVER_PORT}`,
    close: async () => {
      receiverPoller?.stop();
      await app.close();
      db.close();
    },
  };
}
