import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 of the raw body, lowercase hex. */
export function signPayload(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: 'MISSING_SIGNATURE' | 'MALFORMED_SIGNATURE' | 'SIGNATURE_MISMATCH' };

/**
 * Constant-time verification of an HMAC-SHA256 signature.
 * Accepts `<hex>` or `sha256=<hex>` header formats.
 */
export function verifySignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined | null,
  secret: string,
): SignatureCheck {
  if (!signatureHeader) return { ok: false, reason: 'MISSING_SIGNATURE' };
  const provided = signatureHeader.trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(provided)) return { ok: false, reason: 'MALFORMED_SIGNATURE' };

  const expected = Buffer.from(signPayload(rawBody, secret), 'hex');
  const actual = Buffer.from(provided, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'SIGNATURE_MISMATCH' };
  }
  return { ok: true };
}

export type TimestampCheck =
  { ok: true } | { ok: false; reason: 'INVALID_TIMESTAMP' | 'STALE_TIMESTAMP' };

/** Replay protection: reject events whose timestamp is outside ±toleranceSeconds of now. */
export function verifyTimestamp(
  timestamp: string,
  toleranceSeconds: number,
  now: Date = new Date(),
): TimestampCheck {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return { ok: false, reason: 'INVALID_TIMESTAMP' };
  if (Math.abs(now.getTime() - time) > toleranceSeconds * 1000) {
    return { ok: false, reason: 'STALE_TIMESTAMP' };
  }
  return { ok: true };
}
