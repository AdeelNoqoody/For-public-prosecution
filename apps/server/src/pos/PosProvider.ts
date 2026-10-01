import type { IncomingHttpHeaders } from 'node:http';
import type { Currency, PosResultStatus, PosTransactionStatus } from '@kiosk/shared';

/*
 * Vendor-neutral POS adapter. Every provider (mock or real vendor) maps its own wire
 * format onto these normalized types, so PaymentService never sees vendor details.
 */

export interface PosCreateTransactionInput {
  amountMinor: number;
  currency: Currency;
  /** Our unique reference for the payment; also used as the idempotency key at the POS. */
  merchantReference: string;
  terminalId: string;
  callbackUrl: string;
  description?: string;
}

export interface PosTransaction {
  transactionId: string;
  merchantReference: string;
  status: PosTransactionStatus;
  amountMinor: number;
  currency: Currency;
  authCode?: string | null;
  /** Must already be masked; adapters pass provider data through `maskPan`. */
  maskedPan?: string | null;
  cardScheme?: string | null;
  reason?: string | null;
  /** Full transaction detail for the receipt/records (populated by the real provider). */
  rrn?: string | null;
  pun?: string | null;
  terminalId?: string | null;
  errorCode?: string | null;
  customerMessage?: string | null;
}

/** A verified, validated result notification from the POS provider. */
export interface PosWebhookEvent extends PosTransaction {
  eventId: string;
  status: PosResultStatus;
  timestamp: string;
}

export type WebhookRejectionCode =
  | 'MISSING_SIGNATURE'
  | 'MALFORMED_SIGNATURE'
  | 'SIGNATURE_MISMATCH'
  | 'INVALID_JSON'
  | 'INVALID_PAYLOAD'
  | 'INVALID_TIMESTAMP'
  | 'STALE_TIMESTAMP';

export class WebhookRejectedError extends Error {
  constructor(
    readonly code: WebhookRejectionCode,
    readonly signatureValid: boolean,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'WebhookRejectedError';
  }

  get httpStatus(): number {
    return this.signatureValid ? 400 : 401;
  }
}

export class PosUnavailableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PosUnavailableError';
  }
}

export interface PosProvider {
  readonly name: string;
  createTransaction(input: PosCreateTransactionInput): Promise<PosTransaction>;
  getTransaction(transactionId: string): Promise<PosTransaction>;
  /** Requests cancellation; returns the transaction state after the request (may still be PENDING). */
  cancelTransaction(transactionId: string): Promise<PosTransaction>;
  /**
   * Verifies authenticity (signature + replay window) and validates the payload.
   * Throws WebhookRejectedError if the webhook must not be trusted.
   */
  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): PosWebhookEvent;
}
