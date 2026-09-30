import { randomBytes, randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import {
  canTransition,
  isFinalStatus,
  type CreatePaymentRequest,
  type PaymentStatus,
  type PosTransactionStatus,
} from '@kiosk/shared';
import { HttpError, conflict, notFound } from '../errors';
import {
  toPaymentView,
  type PaymentPatch,
  type PaymentRecord,
  type PaymentRepository,
} from '../db/paymentRepository';
import type { PosProvider, PosTransaction, PosWebhookEvent } from '../pos';
import type { PaymentEvents } from './PaymentEvents';

export interface PaymentServiceOptions {
  terminalId: string;
  /** Full URL the POS provider should POST results to, e.g. {PUBLIC_URL}/webhooks/pos */
  callbackUrl: string;
  paymentTimeoutSeconds: number;
  /** Reject payments above this amount (minor units) before they reach the POS. 0 = no limit. */
  maxAmountMinor?: number;
  now?: () => Date;
}

export type ApplySource = 'webhook' | 'poll' | 'cancel' | 'create';
export type ApplyOutcome = 'applied' | 'duplicate' | 'ignored_final_state' | 'unknown_transaction';

export interface ApplyResult {
  outcome: ApplyOutcome;
  payment?: PaymentRecord;
}

const POS_TO_PAYMENT_STATUS: Record<Exclude<PosTransactionStatus, 'PENDING'>, PaymentStatus> = {
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  ERROR: 'ERROR',
};

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14); // yyyyMMddHHmmss
}

function randomCode(length: number): string {
  return randomBytes(length).toString('hex').slice(0, length).toUpperCase();
}

export class PaymentService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly now: () => Date;

  constructor(
    private readonly repo: PaymentRepository,
    private readonly pos: PosProvider,
    private readonly events: PaymentEvents,
    private readonly logger: Logger,
    private readonly options: PaymentServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  find(paymentId: string): PaymentRecord | undefined {
    return this.repo.findById(paymentId);
  }

  get(paymentId: string): PaymentRecord {
    const payment = this.repo.findById(paymentId);
    if (!payment) throw notFound(`Payment ${paymentId} not found`);
    return payment;
  }

  /**
   * Creates the payment record and sends the request to the POS terminal.
   * Resolves once the POS accepted (PENDING) or rejected (ERROR) the request; the final
   * result arrives later via webhook (or polling fallback on timeout).
   */
  async createPayment(
    request: CreatePaymentRequest,
    idempotencyKey?: string,
  ): Promise<PaymentRecord> {
    if (idempotencyKey) {
      const existing = this.repo.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.amountMinor !== request.amountMinor || existing.kioskId !== request.kioskId) {
          throw conflict('Idempotency-Key was already used for a different payment');
        }
        return existing;
      }
    }

    const limit = this.options.maxAmountMinor ?? 0;
    if (limit > 0 && request.amountMinor > limit) {
      throw new HttpError(
        400,
        'AMOUNT_LIMIT_EXCEEDED',
        `Payments above ${limit} minor units are not allowed`,
      );
    }

    // TODO(real data): re-price items server side via the DataProvider instead of trusting
    // amounts sent by the kiosk, once the real backend exposes item lookups by id.
    const nowDate = this.now();
    const now = nowDate.toISOString();
    const payment: PaymentRecord = {
      id: randomUUID(),
      kioskId: request.kioskId,
      merchantReference: `KSK-${compactTimestamp(nowDate)}-${randomCode(8)}`,
      idempotencyKey: idempotencyKey ?? null,
      amountMinor: request.amountMinor,
      currency: request.currency,
      items: request.items,
      status: 'CREATED',
      posTransactionId: null,
      authCode: null,
      maskedPan: null,
      cardScheme: null,
      failureReason: null,
      receiptNumber: null,
      needsReconciliation: false,
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
      completedAt: null,
    };
    this.repo.insert(payment);
    const log = this.logger.child({
      paymentId: payment.id,
      merchantReference: payment.merchantReference,
    });
    log.info({ amountMinor: payment.amountMinor, kioskId: payment.kioskId }, 'Payment created');

    let tx: PosTransaction;
    try {
      tx = await this.pos.createTransaction({
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        merchantReference: payment.merchantReference,
        terminalId: this.options.terminalId,
        callbackUrl: this.options.callbackUrl,
        description: `Kiosk ${payment.kioskId} payment`,
      });
    } catch (error) {
      log.error({ err: error }, 'POS rejected or did not accept the transaction');
      return (
        this.transitionAndPublish(
          payment,
          'ERROR',
          { failureReason: 'POS_UNAVAILABLE', completedAt: now },
          'create',
        ) ?? this.get(payment.id)
      );
    }

    const expiresAt = new Date(
      this.now().getTime() + this.options.paymentTimeoutSeconds * 1000,
    ).toISOString();
    const pending = this.transitionAndPublish(
      payment,
      'PENDING',
      { posTransactionId: tx.transactionId, expiresAt },
      'create',
    );

    if (!pending) {
      // The kiosk cancelled while the POS request was in flight: cancel it at the terminal too.
      const current = this.repo.patch(
        payment.id,
        { posTransactionId: tx.transactionId },
        this.now().toISOString(),
      );
      log.warn(
        { status: current?.status },
        'Payment changed state while POS request was in flight; cancelling at POS',
      );
      void this.pos
        .cancelTransaction(tx.transactionId)
        .catch((err: unknown) => log.error({ err }, 'POS cancel failed'));
      return current ?? this.get(payment.id);
    }

    log.info({ posTransactionId: tx.transactionId, expiresAt }, 'Payment pending at POS terminal');
    if (tx.status !== 'PENDING') {
      return this.applyTransaction(pending, tx, 'create').payment ?? pending;
    }
    this.scheduleTimeout(pending);
    return pending;
  }

  /** Kiosk-initiated cancellation. Throws PosUnavailableError if the POS can't be reached. */
  async cancel(paymentId: string): Promise<PaymentRecord> {
    const payment = this.get(paymentId);
    if (isFinalStatus(payment.status)) return payment;

    if (payment.status === 'CREATED' || !payment.posTransactionId) {
      return (
        this.transitionAndPublish(
          payment,
          'CANCELLED',
          { failureReason: 'CANCELLED_BY_USER', completedAt: this.now().toISOString() },
          'cancel',
        ) ?? this.get(paymentId)
      );
    }

    const tx = await this.pos.cancelTransaction(payment.posTransactionId);
    this.logger.info({ paymentId, posStatus: tx.status }, 'POS cancel requested');
    // If still PENDING the POS will confirm asynchronously via webhook.
    if (tx.status !== 'PENDING') this.applyTransaction(this.get(paymentId), tx, 'cancel');
    return this.get(paymentId);
  }

  /** Applies a verified webhook. Idempotent: duplicates and late events never change a final state. */
  applyWebhook(event: PosWebhookEvent): ApplyResult {
    const payment =
      this.repo.findByPosTransactionId(event.transactionId) ??
      this.repo.findByMerchantReference(event.merchantReference);
    if (!payment) return { outcome: 'unknown_transaction' };
    if (payment.posTransactionId && payment.posTransactionId !== event.transactionId) {
      this.logger.warn(
        { paymentId: payment.id, eventTx: event.transactionId },
        'Webhook transaction id mismatch',
      );
      return { outcome: 'unknown_transaction' };
    }
    return this.applyTransaction(payment, event, 'webhook');
  }

  /** Re-arms timeouts for payments left PENDING by a previous process (e.g. after a restart). */
  resumePending(): void {
    for (const payment of this.repo.listByStatus('PENDING')) this.scheduleTimeout(payment);
    for (const payment of this.repo.listByStatus('CREATED')) {
      // We cannot know whether the POS received the request: fail it and flag for reconciliation.
      this.transitionAndPublish(
        payment,
        'ERROR',
        {
          failureReason: 'INTERRUPTED',
          needsReconciliation: true,
          completedAt: this.now().toISOString(),
        },
        'poll',
      );
    }
  }

  /**
   * Called when no final result arrived before the payment expired: poll the POS for the
   * real status, cancel at the terminal if still pending, and finally mark TIMEOUT.
   */
  async handleTimeout(paymentId: string): Promise<void> {
    this.clearTimer(paymentId);
    const payment = this.repo.findById(paymentId);
    if (!payment || isFinalStatus(payment.status)) return;
    const log = this.logger.child({ paymentId });
    log.warn('No payment result before timeout; polling POS');

    if (payment.status === 'PENDING' && payment.posTransactionId) {
      try {
        const polled = await this.pos.getTransaction(payment.posTransactionId);
        if (polled.status !== 'PENDING') {
          this.applyTransaction(this.get(paymentId), polled, 'poll');
          return;
        }
        const afterCancel = await this.pos.cancelTransaction(payment.posTransactionId);
        if (afterCancel.status !== 'PENDING' && afterCancel.status !== 'CANCELLED') {
          // The terminal completed right before our cancel reached it.
          this.applyTransaction(this.get(paymentId), afterCancel, 'poll');
          return;
        }
      } catch (error) {
        log.error({ err: error }, 'POS status poll/cancel failed during timeout handling');
      }
    }

    const current = this.get(paymentId);
    if (isFinalStatus(current.status)) return;
    const target: PaymentStatus = current.status === 'PENDING' ? 'TIMEOUT' : 'ERROR';
    this.transitionAndPublish(
      current,
      target,
      { failureReason: 'NO_RESPONSE_FROM_TERMINAL', completedAt: this.now().toISOString() },
      'poll',
    );
  }

  shutdown(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private applyTransaction(
    payment: PaymentRecord,
    tx: PosTransaction,
    source: ApplySource,
  ): ApplyResult {
    if (tx.status === 'PENDING') return { outcome: 'ignored_final_state', payment };
    const log = this.logger.child({ paymentId: payment.id, source });
    let target = POS_TO_PAYMENT_STATUS[tx.status];

    if (isFinalStatus(payment.status)) {
      if (payment.status === target) {
        log.info({ status: target }, 'Duplicate POS result ignored');
        return { outcome: 'duplicate', payment };
      }
      // A conflicting result for an already-final payment (e.g. APPROVED after TIMEOUT).
      // Never flip a final state; flag it so operations can refund/reconcile.
      log.error(
        { currentStatus: payment.status, posStatus: tx.status, posTransactionId: tx.transactionId },
        'Conflicting POS result for a final payment — needs manual reconciliation',
      );
      const flagged =
        tx.status === 'APPROVED'
          ? this.repo.patch(payment.id, { needsReconciliation: true }, this.now().toISOString())
          : payment;
      return { outcome: 'ignored_final_state', payment: flagged ?? payment };
    }

    const now = this.now().toISOString();
    const patch: PaymentPatch = {
      posTransactionId: payment.posTransactionId ?? tx.transactionId,
      authCode: tx.authCode ?? null,
      maskedPan: tx.maskedPan ?? null,
      cardScheme: tx.cardScheme ?? null,
      completedAt: now,
    };

    if (
      target === 'APPROVED' &&
      (tx.amountMinor !== payment.amountMinor || tx.currency !== payment.currency)
    ) {
      log.error(
        { expected: payment.amountMinor, received: tx.amountMinor },
        'POS approved a different amount',
      );
      target = 'ERROR';
      patch.failureReason = 'AMOUNT_MISMATCH';
      patch.needsReconciliation = true;
    } else if (target === 'APPROVED') {
      patch.receiptNumber = `R${compactTimestamp(this.now()).slice(0, 8)}-${randomCode(6)}`;
    } else {
      patch.failureReason = tx.reason ?? tx.status;
    }

    if (!canTransition(payment.status, target)) {
      return { outcome: 'ignored_final_state', payment };
    }
    const updated = this.transitionAndPublish(payment, target, patch, source);
    if (!updated) {
      // Lost a race with another update: re-evaluate against the fresh state.
      return this.applyTransaction(this.get(payment.id), tx, source);
    }
    log.info(
      { status: updated.status, posTransactionId: tx.transactionId },
      'Payment result applied',
    );
    return { outcome: 'applied', payment: updated };
  }

  private transitionAndPublish(
    payment: PaymentRecord,
    to: PaymentStatus,
    patch: PaymentPatch,
    source: ApplySource | 'cancel',
  ): PaymentRecord | undefined {
    if (!canTransition(payment.status, to)) return undefined;
    const updated = this.repo.transition(
      payment.id,
      payment.status,
      to,
      patch,
      source,
      this.now().toISOString(),
    );
    if (!updated) return undefined;
    if (isFinalStatus(updated.status)) this.clearTimer(updated.id);
    this.events.publish(toPaymentView(updated));
    return updated;
  }

  private scheduleTimeout(payment: PaymentRecord): void {
    this.clearTimer(payment.id);
    const expiresAt = payment.expiresAt ? Date.parse(payment.expiresAt) : this.now().getTime();
    const delay = Math.max(0, expiresAt - this.now().getTime());
    const timer = setTimeout(() => {
      this.handleTimeout(payment.id).catch((err: unknown) =>
        this.logger.error({ err, paymentId: payment.id }, 'Timeout handling failed'),
      );
    }, delay);
    timer.unref();
    this.timers.set(payment.id, timer);
  }

  private clearTimer(paymentId: string): void {
    const timer = this.timers.get(paymentId);
    if (timer) clearTimeout(timer);
    this.timers.delete(paymentId);
  }
}
