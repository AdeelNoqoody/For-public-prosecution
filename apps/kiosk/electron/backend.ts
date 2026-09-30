import path from 'node:path';
import { buildMockPos } from '../../mock-pos/src/app';
import { startEmbeddedServer } from '../../server/src/embedded';

export interface EmbeddedBackend {
  serverUrl: string;
  stop(): Promise<void>;
}

/**
 * Defaults for the standalone desktop app. Anything in kiosk.env (or the real environment)
 * overrides these. Ports differ from the dev setup (4000/4100) so both can run side by side.
 */
const EMBEDDED_DEFAULTS: Record<string, string> = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info',
  SERVER_HOST: '127.0.0.1',
  SERVER_PORT: '4800',
  MOCK_POS_PORT: '4900',
  DATA_PROVIDER: 'mock',
  POS_PROVIDER: 'mock',
  POS_TERMINAL_ID: 'TERM-0001',
  POS_API_KEY: '',
  MOCK_POS_DELAY_MS: '5000',
  MOCK_POS_OUTCOME: 'auto',
  PAYMENT_TIMEOUT_SECONDS: '120',
  MAX_PAYMENT_AMOUNT_MINOR: '100',
};

// Only used with the built-in mock POS; a real POS must configure its own secret in kiosk.env.
const MOCK_WEBHOOK_SECRET = 'embedded-mock-pos-webhook-secret';

export async function startEmbeddedBackend(dataDir: string): Promise<EmbeddedBackend> {
  const env: Record<string, string | undefined> = { ...EMBEDDED_DEFAULTS, ...process.env };
  const serverPort = env.SERVER_PORT;
  const posPort = Number(env.MOCK_POS_PORT);
  const useMockPos = env.POS_PROVIDER === 'mock';

  if (useMockPos) {
    env.POS_BASE_URL ||= `http://127.0.0.1:${posPort}`;
    env.POS_WEBHOOK_SECRET ||= MOCK_WEBHOOK_SECRET;
  }
  // Where the POS sends results. Local for the mock; set PUBLIC_URL for a cloud POS.
  env.PUBLIC_URL ||= `http://127.0.0.1:${serverPort}`;

  const logDir = path.join(dataDir, 'logs');
  const stops: (() => Promise<unknown>)[] = [];

  if (useMockPos) {
    const pos = await buildMockPos({
      webhookSecret: env.POS_WEBHOOK_SECRET ?? MOCK_WEBHOOK_SECRET,
      apiKey: env.POS_API_KEY || undefined,
      delayMs: Number(env.MOCK_POS_DELAY_MS),
      outcome: (env.MOCK_POS_OUTCOME ?? 'auto') as Parameters<typeof buildMockPos>[0]['outcome'],
      logLevel: 'warn',
    });
    await pos.listen({ port: posPort, host: '127.0.0.1' });
    stops.push(() => pos.close());
  }

  const server = await startEmbeddedServer({
    env,
    databasePath: path.join(dataDir, 'kiosk.db'),
    logFile: path.join(logDir, 'server.log'),
  });
  stops.unshift(() => server.close());

  return {
    serverUrl: server.url,
    stop: async () => {
      for (const stop of stops) await stop().catch(() => undefined);
    },
  };
}
