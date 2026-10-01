import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { findEnvFile } from '@kiosk/shared/node';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  SERVER_HOST: z.string().default('0.0.0.0'),
  PUBLIC_URL: z.url().default('http://localhost:4000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_PATH: z.string().default('./data/kiosk.db'),

  DATA_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  MOCK_LATENCY_MIN_MS: z.coerce.number().int().nonnegative().default(300),
  MOCK_LATENCY_MAX_MS: z.coerce.number().int().nonnegative().default(800),

  POS_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  POS_BASE_URL: z.url().default('http://localhost:4100'),
  POS_API_KEY: z.string().default(''),
  /** Noqoody: the merchant id and AES key. Only required when POS_PROVIDER=real. */
  POS_MERCHANT_ID: z.string().default(''),
  POS_ENCRYPTION_KEY: z.string().default(''),
  /** Noqoody: the POS device to charge (posDeviceId). Carried through as the terminal id. */
  POS_TERMINAL_ID: z.string().min(1).default('TERM-0001'),
  POS_WEBHOOK_SECRET: z.string().min(16, 'POS_WEBHOOK_SECRET must be at least 16 characters'),
  POS_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  POS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /** Base URL of the public webhook-receiver the kiosk polls for results (e.g. https://pp.enoqoody.com). Empty = disabled. */
  RECEIVER_URL: z.string().default(''),
  /** How often (ms) to poll the receiver's /result/{id} for a pending payment. */
  RECEIVER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),

  PAYMENT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
  /** Hard cap per payment in minor units (100 = 1.00 QAR) for the live-POS demo. 0 = no limit. */
  MAX_PAYMENT_AMOUNT_MINOR: z.coerce.number().int().nonnegative().default(100),
  /** Comma separated list, or * to allow any origin (kiosk renderer runs from file:// in production). */
  CORS_ORIGINS: z.string().default('*'),
});

export type ServerConfig = z.infer<typeof EnvSchema>;

/** Validates configuration from an env object (no .env loading — used directly by tests). */
export function parseConfig(env: Record<string, string | undefined>): ServerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Loads the monorepo .env (without overriding real env vars) and validates it. */
export function loadConfig(): ServerConfig {
  const envFile = findEnvFile();
  if (envFile) loadDotenv({ path: envFile, quiet: true });
  return parseConfig(process.env);
}
