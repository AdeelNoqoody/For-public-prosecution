import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Structured logger. Card data must never be logged: known sensitive keys are redacted
 * wherever they appear, and only masked PANs are ever passed to the logger.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-signature"]',
  'headers.authorization',
  '*.pan',
  '*.cardNumber',
  '*.track2',
  '*.cvv',
  '*.pin',
  '*.expiry',
];

export function createLogger(options: {
  level: string;
  pretty?: boolean;
  /** Write JSON logs to this file instead of stdout (used when embedded in the desktop app). */
  file?: string;
}): Logger {
  const base: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
  if (options.pretty) {
    return pino({
      ...base,
      transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss.l' } },
    });
  }
  if (options.file) {
    return pino(base, pino.destination({ dest: options.file, mkdir: true, sync: false }));
  }
  return pino(base);
}
