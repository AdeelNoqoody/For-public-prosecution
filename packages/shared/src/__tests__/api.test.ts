import { describe, expect, it } from 'vitest';
import { CreatePaymentRequestSchema } from '../api';
import { isValidPlateNumber } from '../plate';

const item = (id: string, amountMinor: number) => ({
  id,
  kind: 'VIOLATION' as const,
  description: { en: 'x', ar: 'س' },
  amountMinor,
  currency: 'QAR' as const,
});

describe('CreatePaymentRequestSchema', () => {
  it('accepts a request whose amount equals the sum of items', () => {
    const result = CreatePaymentRequestSchema.safeParse({
      kioskId: 'K1',
      items: [item('a', 30000), item('b', 50000)],
      amountMinor: 80000,
      currency: 'QAR',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an amount that does not match the items', () => {
    const result = CreatePaymentRequestSchema.safeParse({
      kioskId: 'K1',
      items: [item('a', 30000)],
      amountMinor: 100,
      currency: 'QAR',
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate items, empty baskets and non-integer amounts', () => {
    const base = { kioskId: 'K1', currency: 'QAR' };
    expect(
      CreatePaymentRequestSchema.safeParse({
        ...base,
        items: [item('a', 1), item('a', 1)],
        amountMinor: 2,
      }).success,
    ).toBe(false);
    expect(
      CreatePaymentRequestSchema.safeParse({ ...base, items: [], amountMinor: 0 }).success,
    ).toBe(false);
    expect(
      CreatePaymentRequestSchema.safeParse({ ...base, items: [item('a', 10.5)], amountMinor: 10.5 })
        .success,
    ).toBe(false);
  });
});

describe('plate validation', () => {
  it('accepts 1–6 digit plates not starting with 0', () => {
    expect(isValidPlateNumber('1')).toBe(true);
    expect(isValidPlateNumber('123456')).toBe(true);
    expect(isValidPlateNumber('0123')).toBe(false);
    expect(isValidPlateNumber('1234567')).toBe(false);
    expect(isValidPlateNumber('12A')).toBe(false);
    expect(isValidPlateNumber('')).toBe(false);
  });
});
