import type { PosResultStatus } from '@kiosk/shared';

export const OUTCOME_MODES = ['auto', 'approve', 'decline', 'error', 'timeout', 'manual'] as const;
export type OutcomeMode = (typeof OUTCOME_MODES)[number];

export interface PlannedOutcome {
  /** Final status to reach after the delay, or null to stay PENDING (timeout / manual). */
  status: PosResultStatus | null;
  sendWebhook: boolean;
  reason?: string;
}

/**
 * Decides what the simulated terminal does with a transaction.
 * In `auto` mode the fractional part of the amount selects the outcome:
 *   x.01 → DECLINED           x.02 → never completes (server times out)
 *   x.03 → ERROR              x.04 → APPROVED but webhook is "lost" (tests polling fallback)
 *   anything else → APPROVED
 */
export function planOutcome(mode: OutcomeMode, amountMinor: number): PlannedOutcome {
  switch (mode) {
    case 'approve':
      return { status: 'APPROVED', sendWebhook: true };
    case 'decline':
      return { status: 'DECLINED', sendWebhook: true, reason: 'INSUFFICIENT_FUNDS' };
    case 'error':
      return { status: 'ERROR', sendWebhook: true, reason: 'TERMINAL_ERROR' };
    case 'timeout':
    case 'manual':
      return { status: null, sendWebhook: false };
    case 'auto':
      switch (amountMinor % 100) {
        case 1:
          return { status: 'DECLINED', sendWebhook: true, reason: 'INSUFFICIENT_FUNDS' };
        case 2:
          return { status: null, sendWebhook: false };
        case 3:
          return { status: 'ERROR', sendWebhook: true, reason: 'TERMINAL_ERROR' };
        case 4:
          return { status: 'APPROVED', sendWebhook: false };
        default:
          return { status: 'APPROVED', sendWebhook: true };
      }
  }
}
