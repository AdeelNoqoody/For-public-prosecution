import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature, verifyTimestamp } from '../node/signature';
import { maskPan } from '../pos';

const SECRET = 'test-secret-0123456789';
const BODY = JSON.stringify({ eventId: 'evt_1', status: 'APPROVED', amountMinor: 1000 });

describe('webhook signature verification', () => {
  it('accepts a valid HMAC-SHA256 signature (hex or sha256= prefixed)', () => {
    const signature = signPayload(BODY, SECRET);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignature(BODY, signature, SECRET)).toEqual({ ok: true });
    expect(verifySignature(Buffer.from(BODY), `sha256=${signature}`, SECRET)).toEqual({ ok: true });
    expect(verifySignature(BODY, signature.toUpperCase(), SECRET)).toEqual({ ok: true });
  });

  it('rejects a tampered body', () => {
    const signature = signPayload(BODY, SECRET);
    const tampered = BODY.replace('1000', '1');
    expect(verifySignature(tampered, signature, SECRET)).toEqual({
      ok: false,
      reason: 'SIGNATURE_MISMATCH',
    });
  });

  it('rejects a signature made with another secret', () => {
    const signature = signPayload(BODY, 'another-secret-987654321');
    expect(verifySignature(BODY, signature, SECRET)).toEqual({
      ok: false,
      reason: 'SIGNATURE_MISMATCH',
    });
  });

  it('rejects missing and malformed signatures', () => {
    expect(verifySignature(BODY, undefined, SECRET)).toEqual({
      ok: false,
      reason: 'MISSING_SIGNATURE',
    });
    expect(verifySignature(BODY, '', SECRET)).toEqual({ ok: false, reason: 'MISSING_SIGNATURE' });
    expect(verifySignature(BODY, 'not-hex', SECRET)).toEqual({
      ok: false,
      reason: 'MALFORMED_SIGNATURE',
    });
    expect(verifySignature(BODY, 'abcd', SECRET)).toEqual({
      ok: false,
      reason: 'MALFORMED_SIGNATURE',
    });
  });

  it('is sensitive to whitespace/re-serialisation (must use the raw body)', () => {
    const signature = signPayload(BODY, SECRET);
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifySignature(reserialised, signature, SECRET).ok).toBe(false);
  });
});

describe('webhook replay protection', () => {
  const now = new Date('2026-09-29T10:00:00Z');

  it('accepts timestamps inside the tolerance window', () => {
    expect(verifyTimestamp('2026-09-29T09:57:00Z', 300, now)).toEqual({ ok: true });
    expect(verifyTimestamp('2026-09-29T10:04:59Z', 300, now)).toEqual({ ok: true });
  });

  it('rejects stale or far-future timestamps', () => {
    expect(verifyTimestamp('2026-09-29T09:54:59Z', 300, now)).toEqual({
      ok: false,
      reason: 'STALE_TIMESTAMP',
    });
    expect(verifyTimestamp('2026-09-29T10:10:00Z', 300, now)).toEqual({
      ok: false,
      reason: 'STALE_TIMESTAMP',
    });
  });

  it('rejects unparseable timestamps', () => {
    expect(verifyTimestamp('yesterday', 300, now)).toEqual({
      ok: false,
      reason: 'INVALID_TIMESTAMP',
    });
  });
});

describe('maskPan', () => {
  it('never exposes more than the last 4 digits', () => {
    expect(maskPan('4111111111111111')).toBe('**** **** **** 1111');
    expect(maskPan('4111 1111 1111 1234')).toBe('**** **** **** 1234');
    expect(maskPan('**** **** **** 4444')).toBe('**** **** **** 4444');
    expect(maskPan('12')).toBe('****');
    expect(maskPan(null)).toBeNull();
  });
});
