import { buildApp } from './app';
import { parseConfig } from './config';
import { createDataProvider } from './data';
import { openDatabase } from './db/database';
import { createLogger } from './logger';
import { createPosProvider } from './pos';

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
  const { app, payments } = await buildApp({
    config,
    logger,
    db,
    data: createDataProvider(config),
    pos: createPosProvider(config, logger),
  });
  await app.listen({ port: config.SERVER_PORT, host: config.SERVER_HOST });
  payments.resumePending();
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
      await app.close();
      db.close();
    },
  };
}
