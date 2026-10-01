import type { Logger } from 'pino';
import { maskPan, toMinor, type Currency, type PosResultStatus } from '@kiosk/shared';
import type { PaymentRepository } from '../db/paymentRepository';
import type { PaymentService } from '../payments/PaymentService';
import type { PosWebhookEvent } from './PosProvider';

/*
 * Polls the public webhook-receiver's GET /result/{id} for every PENDING payment and applies the
 * result through the normal payment pipeline (which updates the DB and pushes to the kiosk over
 * WebSocket). This is how the kiosk learns a card result when the callback is delivered to the
 * separate receiver service instead of directly to this server.
 */

interface ReceiverPollerConfig {
  baseUrl: string;
  intervalMs: number;
  requestTimeoutMs: number;
}

interface ReceiverResult {
  found?: boolean;
  status?: string;
  paymentId?: string;
  orderId?: string;
  authCode?: string | null;
  maskedPan?: string | null;
  cardScheme?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  rrn?: string | null;
  pun?: string | null;
  terminalId?: string | null;
  posDeviceId?: string | null;
  errorCode?: string | null;
  customerMessage?: string | null;
}

/** Noqoody status string → our final result status (null = not final yet, keep polling). */
function mapStatus(status: string, errorCode?: string | null): PosResultStatus | null {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'APPROVED';
    case 'cancelled':
      return 'CANCELLED';
    case 'timeout':
      return 'ERROR';
    case 'failed':
      return errorCode && /cancel/i.test(errorCode) ? 'CANCELLED' : 'DECLINED';
    case 'pending':
    case 'processing':
      return null;
    default:
      return 'ERROR';
  }
}

export class ReceiverPoller {
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly repo: PaymentRepository,
    private readonly payments: PaymentService,
    private readonly config: ReceiverPollerConfig,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref();
    this.logger.info(
      { url: this.config.baseUrl, intervalMs: this.config.intervalMs },
      'Receiver result poller started',
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.busy) return; // don't overlap slow polls
    this.busy = true;
    try {
      for (const payment of this.repo.listByStatus('PENDING')) {
        const id = payment.posTransactionId ?? payment.merchantReference;
        if (!id) continue;
        await this.pollOne(id, payment.merchantReference, payment.amountMinor, payment.currency);
      }
    } finally {
      this.busy = false;
    }
  }

  private async pollOne(
    id: string,
    merchantReference: string,
    fallbackAmountMinor: number,
    fallbackCurrency: Currency,
  ): Promise<void> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/result/${encodeURIComponent(id)}`;
    this.logger.info({ id, url }, 'Polling receiver /result');
    let data: ReceiverResult;
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
      if (!res.ok) {
        this.logger.warn({ id, httpStatus: res.status }, 'Receiver /result returned non-OK');
        return;
      }
      data = (await res.json()) as ReceiverResult;
    } catch (err) {
      this.logger.warn({ err: String(err), id, url }, 'Receiver poll failed (will retry)');
      return;
    }

    this.logger.info(
      { id, found: data.found ?? false, receiverStatus: data.status ?? null },
      'Receiver /result response',
    );
    if (!data.found || !data.status) return; // not received yet — keep polling
    const status = mapStatus(data.status, data.errorCode);
    if (!status) return; // still pending/processing at the receiver

    // Full transaction detail (for the receipt / records / audit).
    this.logger.info({ id, detail: data }, 'Full transaction detail from receiver');

    const amount = data.amount == null ? undefined : Number(data.amount);
    const event: PosWebhookEvent = {
      eventId: `${id}:${status}`,
      transactionId: data.paymentId ?? id,
      merchantReference: data.orderId ?? merchantReference,
      status,
      amountMinor: amount === undefined || Number.isNaN(amount) ? fallbackAmountMinor : toMinor(amount),
      currency: (data.currency as Currency | undefined) ?? fallbackCurrency,
      authCode: data.authCode ?? null,
      maskedPan: maskPan(data.maskedPan),
      cardScheme: data.cardScheme ?? null,
      reason: data.customerMessage ?? data.errorCode ?? null,
      rrn: data.rrn ?? null,
      pun: data.pun ?? null,
      terminalId: data.terminalId ?? null,
      errorCode: data.errorCode ?? null,
      customerMessage: data.customerMessage ?? null,
      timestamp: new Date().toISOString(),
    };

    const result = this.payments.applyWebhook(event);
    this.logger.info(
      { transactionId: event.transactionId, status, outcome: result.outcome },
      'Applied payment result from receiver',
    );
  }
}
