import type { IncomingHttpHeaders } from 'node:http';
import type { Logger } from 'pino';
import {
  GenericPosTransactionSchema,
  GenericPosWebhookPayloadSchema,
  SIGNATURE_HEADER,
  maskPan,
  type GenericPosCreateTransactionRequest,
  type GenericPosTransaction,
} from '@kiosk/shared';
import { verifySignature, verifyTimestamp } from '@kiosk/shared/node';
import {
  PosUnavailableError,
  WebhookRejectedError,
  type PosCreateTransactionInput,
  type PosProvider,
  type PosTransaction,
  type PosWebhookEvent,
} from './PosProvider';

export interface GenericPosConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  webhookToleranceSeconds: number;
  requestTimeoutMs: number;
  /** Noqoody (real provider) only — ignored by the mock. */
  merchantId: string;
  encryptionKey: string;
  /** Seconds the terminal waits for the customer to present a card. */
  deviceTimeoutSeconds: number;
}

/**
 * Adapter for the generic POS HTTP contract implemented by apps/mock-pos:
 *   POST /transactions, GET /transactions/:id, POST /transactions/:id/cancel,
 *   webhooks signed with HMAC-SHA256(raw body) in the X-Signature header.
 */
export class MockPosProvider implements PosProvider {
  readonly name: string = 'mock';

  constructor(
    private readonly config: GenericPosConfig,
    private readonly logger: Logger,
  ) {}

  async createTransaction(input: PosCreateTransactionInput): Promise<PosTransaction> {
    const body: GenericPosCreateTransactionRequest = {
      amountMinor: input.amountMinor,
      currency: input.currency,
      merchantReference: input.merchantReference,
      terminalId: input.terminalId,
      callbackUrl: input.callbackUrl,
      description: input.description,
    };
    const tx = await this.request('POST', '/transactions', body, input.merchantReference);
    return this.normalize(tx);
  }

  async getTransaction(transactionId: string): Promise<PosTransaction> {
    return this.normalize(
      await this.request('GET', `/transactions/${encodeURIComponent(transactionId)}`),
    );
  }

  async cancelTransaction(transactionId: string): Promise<PosTransaction> {
    return this.normalize(
      await this.request('POST', `/transactions/${encodeURIComponent(transactionId)}/cancel`, {}),
    );
  }

  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): PosWebhookEvent {
    const header = headers[SIGNATURE_HEADER];
    const signature = verifySignature(
      rawBody,
      Array.isArray(header) ? header[0] : header,
      this.config.webhookSecret,
    );
    if (!signature.ok) throw new WebhookRejectedError(signature.reason, false);

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new WebhookRejectedError('INVALID_JSON', true);
    }
    const parsed = GenericPosWebhookPayloadSchema.safeParse(json);
    if (!parsed.success) {
      throw new WebhookRejectedError('INVALID_PAYLOAD', true, parsed.error.message);
    }
    const time = verifyTimestamp(parsed.data.timestamp, this.config.webhookToleranceSeconds);
    if (!time.ok) throw new WebhookRejectedError(time.reason, true);

    const payload = parsed.data;
    return {
      eventId: payload.eventId,
      transactionId: payload.transactionId,
      merchantReference: payload.merchantReference,
      status: payload.status,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
      authCode: payload.authCode ?? null,
      maskedPan: maskPan(payload.maskedPan),
      cardScheme: payload.cardScheme ?? null,
      reason: payload.reason ?? null,
      timestamp: payload.timestamp,
    };
  }

  private normalize(tx: GenericPosTransaction): PosTransaction {
    return {
      transactionId: tx.transactionId,
      merchantReference: tx.merchantReference,
      status: tx.status,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      authCode: tx.authCode ?? null,
      maskedPan: maskPan(tx.maskedPan),
      cardScheme: tx.cardScheme ?? null,
      reason: tx.reason ?? null,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<GenericPosTransaction> {
    const url = new URL(path, this.config.baseUrl).toString();
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      this.logger.error({ err: error, method, url }, 'POS request failed');
      throw new PosUnavailableError(`POS request ${method} ${path} failed`, error);
    }
    const text = await response.text();
    if (!response.ok) {
      this.logger.error(
        { method, url, status: response.status, body: text.slice(0, 500) },
        'POS error response',
      );
      throw new PosUnavailableError(`POS responded ${response.status} to ${method} ${path}`);
    }
    const parsed = GenericPosTransactionSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      this.logger.error({ method, url, issues: parsed.error.issues }, 'Unexpected POS response');
      throw new PosUnavailableError(`Unexpected POS response to ${method} ${path}`);
    }
    return parsed.data;
  }
}
