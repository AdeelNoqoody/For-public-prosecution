import type { Logger } from 'pino';
import type { ServerConfig } from '../config';
import { MockPosProvider, type GenericPosConfig } from './MockPosProvider';
import type { PosProvider } from './PosProvider';
import { RealPosProvider } from './RealPosProvider';

export * from './PosProvider';

export function createPosProvider(config: ServerConfig, logger: Logger): PosProvider {
  const posConfig: GenericPosConfig = {
    baseUrl: config.POS_BASE_URL,
    apiKey: config.POS_API_KEY,
    webhookSecret: config.POS_WEBHOOK_SECRET,
    webhookToleranceSeconds: config.POS_WEBHOOK_TOLERANCE_SECONDS,
    requestTimeoutMs: config.POS_REQUEST_TIMEOUT_MS,
  };
  const log = logger.child({ component: 'pos' });
  return config.POS_PROVIDER === 'real'
    ? new RealPosProvider(posConfig, log)
    : new MockPosProvider(posConfig, log);
}
