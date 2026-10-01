import type { IncomingHttpHeaders } from 'node:http';
import type { Logger } from 'pino';
import { z } from 'zod';
import { maskPan, toMajor, toMinor, type Currency, type PosTransactionStatus } from '@kiosk/shared';
import { verifySignature, verifyTimestamp } from '@kiosk/shared/node';
import { decryptPayload, encryptPayload } from './noqoodyCrypto';
import type { GenericPosConfig } from './MockPosProvider';
import {
  PosUnavailableError,
  WebhookRejectedError,
  type PosCreateTransactionInput,
  type PosProvider,
  type PosTransaction,
  type PosWebhookEvent,
} from './PosProvider';

/**
 * Adapter for the Noqoody SmartECR merchant API (https://smartecr-api.noqoody.qa).
 *
 * Wire format (see the vendor's "Merchant API Documentation v1.0"):
 *  - Auth:       X-Merchant-Key: <apiKey> header on every request.
 *  - Encryption: payment/refund request bodies are AES-256-CBC encrypted inside
 *                { encryptedPayload }; their responses come back as { encryptedResponse }.
 *  - Amounts:    decimal major units (QAR) on the wire; minor units (× 100) internally.
 *  - Device:     the POS terminal is addressed by `posDeviceId` (carried in terminalId here).
 *  - Webhook:    HMAC-SHA256(`${timestamp}.${rawBody}`) in X-Webhook-Signature; the result
 *                detail arrives as an encrypted `encryptedData` field that we decrypt.
 */

const CURRENCY: Currency = 'QAR';
/** How long the terminal waits for the customer to tap/insert their card. */
const DEFAULT_DEVICE_TIMEOUT_SECONDS = 120;

/** Noqoody status vocabulary → our transaction status (includes the in-flight PENDING). */
function mapTransactionStatus(status: string, errorCode?: string | null): PosTransactionStatus {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'APPROVED';
    case 'cancelled':
      return 'CANCELLED';
    case 'pending':
    case 'processing':
      return 'PENDING';
    case 'timeout':
      return 'ERROR';
    case 'failed':
      // A tap cancelled on the terminal is reported as Failed; treat it as a cancellation.
      return errorCode && /cancel/i.test(errorCode) ? 'CANCELLED' : 'DECLINED';
    default:
      return 'ERROR';
  }
}

/*
 * Noqoody is inconsistent about field casing: create/status responses are PascalCase
 * (PaymentId, StatusText, Amount) while webhook detail mixes cases (TransactionId + orderId).
 * These readers look a key up case-insensitively so we never depend on the exact casing.
 * (Confirmed by live testing 2026-09-30: PaymentId, not paymentId.)
 */
function field(obj: unknown, ...names: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  const lowered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) lowered[k.toLowerCase()] = v;
  for (const n of names) {
    const v = lowered[n.toLowerCase()];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

/** Envelope Noqoody POSTs to our callback URL. The detail sits (encrypted) in encryptedData. */
const NoqoodyWebhookEnvelopeSchema = z.object({
  event: z.string(),
  paymentId: z.string(),
  merchantId: z.string().optional(),
  status: z.string(),
  encryptedData: z.string().optional(),
  data: z.unknown().optional(),
  timestamp: z.string(),
});

const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';
const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';

export class RealPosProvider implements PosProvider {
  readonly name = 'real';
  private readonly deviceTimeoutSeconds: number;

  constructor(
    private readonly config: GenericPosConfig,
    private readonly logger: Logger,
  ) {
    this.deviceTimeoutSeconds = config.deviceTimeoutSeconds || DEFAULT_DEVICE_TIMEOUT_SECONDS;
    if (!config.apiKey || !config.encryptionKey) {
      this.logger.warn('RealPosProvider is missing apiKey/encryptionKey — payments will fail');
    }
  }

  async createTransaction(input: PosCreateTransactionInput): Promise<PosTransaction> {
    const payload = {
      posDeviceId: input.terminalId,
      amount: toMajor(input.amountMinor),
      currency: input.currency,
      // paymentMethod: 'Card', // Noqoody API returns HTTP 500 when this is present (confirmed by live testing 2026-09-30). Only Card is supported anyway.
      orderId: input.merchantReference,
      idempotencyKey: input.merchantReference,
      timeoutSeconds: this.deviceTimeoutSeconds,
    };
    const detail = await this.requestEncrypted('POST', '/api/merchant/payments', payload);
    return this.normalize(detail, input.merchantReference, input.amountMinor);
  }

  async getTransaction(transactionId: string): Promise<PosTransaction> {
    const detail = await this.requestEncrypted(
      'GET',
      `/api/merchant/payments/${encodeURIComponent(transactionId)}`,
    );
    return this.normalize(detail);
  }

  async cancelTransaction(transactionId: string): Promise<PosTransaction> {
    // The cancel response only echoes { message, paymentId }; re-read the authoritative status.
    await this.requestEncrypted(
      'POST',
      `/api/merchant/payments/${encodeURIComponent(transactionId)}/cancel`,
      {},
    );
    return this.getTransaction(transactionId);
  }

  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): PosWebhookEvent {
    const bodyStr = rawBody.toString('utf8');
    const timestampHeader = this.header(headers, WEBHOOK_TIMESTAMP_HEADER);
    if (!timestampHeader) throw new WebhookRejectedError('INVALID_TIMESTAMP', false);

    // Noqoody signs `${timestamp}.${rawBody}` with the webhook secret (HMAC-SHA256 hex).
    const signature = verifySignature(
      `${timestampHeader}.${bodyStr}`,
      this.header(headers, WEBHOOK_SIGNATURE_HEADER),
      this.config.webhookSecret,
    );
    if (!signature.ok) throw new WebhookRejectedError(signature.reason, false);

    let json: unknown;
    try {
      json = JSON.parse(bodyStr);
    } catch {
      throw new WebhookRejectedError('INVALID_JSON', true);
    }
    const envelope = NoqoodyWebhookEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new WebhookRejectedError('INVALID_PAYLOAD', true, envelope.error.message);
    }

    const time = verifyTimestamp(envelope.data.timestamp, this.config.webhookToleranceSeconds);
    if (!time.ok) throw new WebhookRejectedError(time.reason, true);

    // The result detail is encrypted (encryptedData) in a real delivery; plain `data` is a fallback.
    let detail: unknown;
    try {
      detail = envelope.data.encryptedData
        ? decryptPayload(envelope.data.encryptedData, this.config.encryptionKey)
        : (envelope.data.data ?? {});
    } catch (error) {
      throw new WebhookRejectedError('INVALID_PAYLOAD', true, String(error));
    }

    const status = mapTransactionStatus(envelope.data.status, str(field(detail, 'errorCode')));
    if (status === 'PENDING') {
      // An intermediate notification carries no final result; nothing to apply.
      throw new WebhookRejectedError('INVALID_PAYLOAD', true, 'non-final webhook status');
    }

    const amount = num(field(detail, 'amount'));
    return {
      // No dedicated event id in the envelope; a payment reaches each final status once.
      eventId: `${envelope.data.paymentId}:${status}`,
      transactionId: envelope.data.paymentId,
      merchantReference: str(field(detail, 'orderId')) ?? '',
      status,
      amountMinor: amount === undefined ? 0 : toMinor(amount),
      currency: (str(field(detail, 'currency')) as Currency | undefined) ?? CURRENCY,
      authCode: str(field(detail, 'authCode')) ?? null,
      maskedPan: maskPan(str(field(detail, 'maskedPan'))),
      cardScheme: str(field(detail, 'cardScheme')) ?? null,
      reason: str(field(detail, 'customerMessage', 'errorMessage', 'errorCode')) ?? null,
      rrn: str(field(detail, 'rrn')) ?? null,
      pun: str(field(detail, 'pun')) ?? null,
      terminalId: str(field(detail, 'terminalId')) ?? null,
      errorCode: str(field(detail, 'errorCode')) ?? null,
      customerMessage: str(field(detail, 'customerMessage', 'errorMessage')) ?? null,
      timestamp: envelope.data.timestamp,
    };
  }

  /** Maps a decrypted Noqoody payment detail onto our normalized PosTransaction. */
  private normalize(
    detail: unknown,
    fallbackReference?: string,
    fallbackAmountMinor?: number,
  ): PosTransaction {
    const statusText = str(field(detail, 'statusText', 'status')) ?? 'pending';
    const amount = num(field(detail, 'amount'));
    return {
      transactionId: str(field(detail, 'paymentId', 'transactionId')) ?? '',
      merchantReference: str(field(detail, 'orderId')) ?? fallbackReference ?? '',
      status: mapTransactionStatus(statusText, str(field(detail, 'errorCode'))),
      amountMinor: amount === undefined ? (fallbackAmountMinor ?? 0) : toMinor(amount),
      currency: (str(field(detail, 'currency')) as Currency | undefined) ?? CURRENCY,
      authCode: str(field(detail, 'authCode')) ?? null,
      maskedPan: maskPan(str(field(detail, 'maskedPan'))),
      cardScheme: str(field(detail, 'cardScheme')) ?? null,
      reason: str(field(detail, 'customerMessage', 'errorMessage', 'errorCode')) ?? null,
      rrn: str(field(detail, 'rrn')) ?? null,
      pun: str(field(detail, 'pun')) ?? null,
      terminalId: str(field(detail, 'terminalId')) ?? null,
      errorCode: str(field(detail, 'errorCode')) ?? null,
      customerMessage: str(field(detail, 'customerMessage', 'errorMessage')) ?? null,
    };
  }

  private header(headers: IncomingHttpHeaders, name: string): string | undefined {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Sends an authenticated request whose body is encrypted and whose response is an
   * { encryptedResponse } envelope, and returns the decrypted detail (raw, mixed-case).
   */
  private async requestEncrypted(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = new URL(path, this.config.baseUrl).toString();
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-merchant-key': this.config.apiKey,
    };
    let encodedBody: string | undefined;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      encodedBody = JSON.stringify({
        encryptedPayload: encryptPayload(body, this.config.encryptionKey),
      });
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: encodedBody,
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      this.logger.error({ err: error, method, url }, 'Noqoody request failed');
      throw new PosUnavailableError(`Noqoody request ${method} ${path} failed`, error);
    }

    const text = await response.text();
    if (!response.ok) {
      this.logger.error(
        { method, url, status: response.status, body: text.slice(0, 500) },
        'Noqoody error response',
      );
      throw new PosUnavailableError(`Noqoody responded ${response.status} to ${method} ${path}`);
    }

    let outer: unknown;
    try {
      outer = JSON.parse(text);
    } catch {
      throw new PosUnavailableError(`Noqoody returned non-JSON for ${method} ${path}`);
    }
    const envelope = z.object({ encryptedResponse: z.string() }).safeParse(outer);
    return envelope.success
      ? decryptPayload(envelope.data.encryptedResponse, this.config.encryptionKey)
      : outer; // GET endpoints (and some errors) return plain JSON.
  }
}
