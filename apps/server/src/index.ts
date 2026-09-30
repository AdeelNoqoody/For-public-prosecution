import { buildApp } from './app';
import { loadConfig } from './config';
import { createDataProvider } from './data';
import { openDatabase } from './db/database';
import { createLogger } from './logger';
import { createPosProvider } from './pos';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development' && process.env.LOG_FORMAT !== 'json',
  });
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
      publicUrl: config.PUBLIC_URL,
    },
    'Kiosk server ready',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
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
