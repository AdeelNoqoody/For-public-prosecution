import { z } from 'zod';

export const PAYMENT_STATUSES = [
  'CREATED',
  'PENDING',
  'APPROVED',
  'DECLINED',
  'CANCELLED',
  'TIMEOUT',
  'ERROR',
] as const;

export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const FINAL_PAYMENT_STATUSES = [
  'APPROVED',
  'DECLINED',
  'CANCELLED',
  'TIMEOUT',
  'ERROR',
] as const satisfies readonly PaymentStatus[];
export type FinalPaymentStatus = (typeof FINAL_PAYMENT_STATUSES)[number];

/**
 * Payment state machine:
 *
 *   CREATED ──► PENDING ──► APPROVED | DECLINED | CANCELLED | TIMEOUT | ERROR
 *      │
 *      └──────► CANCELLED | ERROR   (POS request never accepted)
 *
 * Final states have no outgoing transitions.
 */
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['PENDING', 'CANCELLED', 'ERROR'],
  PENDING: ['APPROVED', 'DECLINED', 'CANCELLED', 'TIMEOUT', 'ERROR'],
  APPROVED: [],
  DECLINED: [],
  CANCELLED: [],
  TIMEOUT: [],
  ERROR: [],
};

export function isFinalStatus(status: PaymentStatus): status is FinalPaymentStatus {
  return (FINAL_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidPaymentTransitionError extends Error {
  constructor(
    readonly from: PaymentStatus,
    readonly to: PaymentStatus,
  ) {
    super(`Invalid payment status transition ${from} -> ${to}`);
    this.name = 'InvalidPaymentTransitionError';
  }
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) throw new InvalidPaymentTransitionError(from, to);
}
