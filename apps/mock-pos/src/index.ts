import { config as loadDotenv } from 'dotenv';
import { findEnvFile } from '@kiosk/shared/node';
import { z } from 'zod';
import { buildMockPos } from './app';
import { OUTCOME_MODES } from './outcome';

const envFile = findEnvFile();
if (envFile) loadDotenv({ path: envFile, quiet: true });

const env = z
  .object({
    MOCK_POS_PORT: z.coerce.number().int().positive().default(4100),
    MOCK_POS_DELAY_MS: z.coerce.number().int().nonnegative().default(5000),
    MOCK_POS_OUTCOME: z.enum(OUTCOME_MODES).default('auto'),
    POS_WEBHOOK_SECRET: z.string().min(16),
    POS_API_KEY: z.string().default(''),
    LOG_LEVEL: z.string().default('info'),
  })
  .parse(process.env);

const app = await buildMockPos({
  webhookSecret: env.POS_WEBHOOK_SECRET,
  apiKey: env.POS_API_KEY || undefined,
  delayMs: env.MOCK_POS_DELAY_MS,
  outcome: env.MOCK_POS_OUTCOME,
  logLevel: env.LOG_LEVEL,
});

await app.listen({ port: env.MOCK_POS_PORT, host: '0.0.0.0' });
app.log.info(`Mock POS control page: http://localhost:${env.MOCK_POS_PORT}/`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
