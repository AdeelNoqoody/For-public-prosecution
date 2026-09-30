import { describe, expect, it } from 'vitest';
import {
  FINAL_PAYMENT_STATUSES,
  InvalidPaymentTransitionError,
  PAYMENT_STATUSES,
  assertTransition,
  canTransition,
  isFinalStatus,
} from '../paymentStatus';

describe('payment state machine', () => {
  it('follows CREATED → PENDING → final', () => {
    expect(canTransition('CREATED', 'PENDING')).toBe(true);
    for (const final of FINAL_PAYMENT_STATUSES) expect(canTransition('PENDING', final)).toBe(true);
  });

  it('lets CREATED fail or be cancelled before the POS accepts it', () => {
    expect(canTransition('CREATED', 'ERROR')).toBe(true);
    expect(canTransition('CREATED', 'CANCELLED')).toBe(true);
    expect(canTransition('CREATED', 'APPROVED')).toBe(false);
    expect(canTransition('CREATED', 'TIMEOUT')).toBe(false);
  });

  it('never leaves a final state', () => {
    for (const from of FINAL_PAYMENT_STATUSES) {
      expect(isFinalStatus(from)).toBe(true);
      for (const to of PAYMENT_STATUSES) expect(canTransition(from, to)).toBe(false);
    }
  });

  it('does not allow going backwards or self-transitions', () => {
    expect(canTransition('PENDING', 'CREATED')).toBe(false);
    expect(canTransition('PENDING', 'PENDING')).toBe(false);
    expect(isFinalStatus('PENDING')).toBe(false);
    expect(isFinalStatus('CREATED')).toBe(false);
  });

  it('assertTransition throws a typed error for invalid transitions', () => {
    expect(() => assertTransition('PENDING', 'APPROVED')).not.toThrow();
    expect(() => assertTransition('APPROVED', 'DECLINED')).toThrow(InvalidPaymentTransitionError);
  });
});
