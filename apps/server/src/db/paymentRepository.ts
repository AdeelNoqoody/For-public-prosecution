import type { SQLInputValue } from 'node:sqlite';
import type { Currency, PayableItem, PaymentStatus, PaymentView } from '@kiosk/shared';
import type { Database } from './database';

export interface PaymentRecord {
  id: string;
  kioskId: string;
  merchantReference: string;
  idempotencyKey: string | null;
  amountMinor: number;
  currency: Currency;
  items: PayableItem[];
  status: PaymentStatus;
  posTransactionId: string | null;
  authCode: string | null;
  maskedPan: string | null;
  cardScheme: string | null;
  failureReason: string | null;
  receiptNumber: string | null;
  rrn: string | null;
  pun: string | null;
  terminalId: string | null;
  errorCode: string | null;
  customerMessage: string | null;
  needsReconciliation: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
}

/** Fields that may change together with a status transition. */
export type PaymentPatch = Partial<
  Pick<
    PaymentRecord,
    | 'posTransactionId'
    | 'authCode'
    | 'maskedPan'
    | 'cardScheme'
    | 'failureReason'
    | 'receiptNumber'
    | 'rrn'
    | 'pun'
    | 'terminalId'
    | 'errorCode'
    | 'customerMessage'
    | 'needsReconciliation'
    | 'expiresAt'
    | 'completedAt'
  >
>;

interface PaymentRow {
  id: string;
  kiosk_id: string;
  merchant_reference: string;
  idempotency_key: string | null;
  amount_minor: number;
  currency: string;
  items_json: string;
  status: string;
  pos_transaction_id: string | null;
  auth_code: string | null;
  masked_pan: string | null;
  card_scheme: string | null;
  failure_reason: string | null;
  receipt_number: string | null;
  rrn: string | null;
  pun: string | null;
  terminal_id: string | null;
  error_code: string | null;
  customer_message: string | null;
  needs_reconciliation: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  completed_at: string | null;
}

const PATCH_COLUMNS: Record<keyof PaymentPatch, string> = {
  posTransactionId: 'pos_transaction_id',
  authCode: 'auth_code',
  maskedPan: 'masked_pan',
  cardScheme: 'card_scheme',
  failureReason: 'failure_reason',
  receiptNumber: 'receipt_number',
  rrn: 'rrn',
  pun: 'pun',
  terminalId: 'terminal_id',
  errorCode: 'error_code',
  customerMessage: 'customer_message',
  needsReconciliation: 'needs_reconciliation',
  expiresAt: 'expires_at',
  completedAt: 'completed_at',
};

function fromRow(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    kioskId: row.kiosk_id,
    merchantReference: row.merchant_reference,
    idempotencyKey: row.idempotency_key,
    amountMinor: row.amount_minor,
    currency: row.currency as Currency,
    items: JSON.parse(row.items_json) as PayableItem[],
    status: row.status as PaymentStatus,
    posTransactionId: row.pos_transaction_id,
    authCode: row.auth_code,
    maskedPan: row.masked_pan,
    cardScheme: row.card_scheme,
    failureReason: row.failure_reason,
    receiptNumber: row.receipt_number,
    rrn: row.rrn,
    pun: row.pun,
    terminalId: row.terminal_id,
    errorCode: row.error_code,
    customerMessage: row.customer_message,
    needsReconciliation: row.needs_reconciliation === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
  };
}

function toSqlValue(value: unknown): SQLInputValue {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) return null;
  return value as SQLInputValue;
}

export function toPaymentView(record: PaymentRecord): PaymentView {
  return {
    paymentId: record.id,
    kioskId: record.kioskId,
    status: record.status,
    amountMinor: record.amountMinor,
    currency: record.currency,
    items: record.items,
    merchantReference: record.merchantReference,
    posTransactionId: record.posTransactionId,
    receiptNumber: record.receiptNumber,
    authCode: record.authCode,
    maskedPan: record.maskedPan,
    cardScheme: record.cardScheme,
    failureReason: record.failureReason,
    rrn: record.rrn,
    pun: record.pun,
    terminalId: record.terminalId,
    errorCode: record.errorCode,
    customerMessage: record.customerMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    completedAt: record.completedAt,
  };
}

export class PaymentRepository {
  constructor(private readonly db: Database) {}

  insert(record: PaymentRecord): void {
    this.db
      .prepare(
        `INSERT INTO payments (id, kiosk_id, merchant_reference, idempotency_key, amount_minor, currency,
           items_json, status, pos_transaction_id, auth_code, masked_pan, card_scheme, failure_reason,
           receipt_number, needs_reconciliation, created_at, updated_at, expires_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.kioskId,
        record.merchantReference,
        record.idempotencyKey,
        record.amountMinor,
        record.currency,
        JSON.stringify(record.items),
        record.status,
        record.posTransactionId,
        record.authCode,
        record.maskedPan,
        record.cardScheme,
        record.failureReason,
        record.receiptNumber,
        record.needsReconciliation ? 1 : 0,
        record.createdAt,
        record.updatedAt,
        record.expiresAt,
        record.completedAt,
      );
    this.recordHistory(record.id, null, record.status, 'create', record.createdAt);
  }

  findById(id: string): PaymentRecord | undefined {
    return this.findOne('SELECT * FROM payments WHERE id = ?', id);
  }

  findByIdempotencyKey(key: string): PaymentRecord | undefined {
    return this.findOne('SELECT * FROM payments WHERE idempotency_key = ?', key);
  }

  findByPosTransactionId(transactionId: string): PaymentRecord | undefined {
    return this.findOne('SELECT * FROM payments WHERE pos_transaction_id = ?', transactionId);
  }

  findByMerchantReference(reference: string): PaymentRecord | undefined {
    return this.findOne('SELECT * FROM payments WHERE merchant_reference = ?', reference);
  }

  listByStatus(status: PaymentStatus): PaymentRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM payments WHERE status = ? ORDER BY created_at')
      .all(status) as unknown as PaymentRow[];
    return rows.map(fromRow);
  }

  /**
   * Compare-and-set status transition. Only succeeds if the payment is still in `from`,
   * which makes concurrent/duplicate updates (webhook + poll + cancel) safe.
   */
  transition(
    id: string,
    from: PaymentStatus,
    to: PaymentStatus,
    patch: PaymentPatch,
    source: string,
    now: string,
  ): PaymentRecord | undefined {
    const sets = ['status = ?', 'updated_at = ?'];
    const values: SQLInputValue[] = [to, now];
    for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof PaymentPatch, string][]) {
      if (key in patch) {
        sets.push(`${column} = ?`);
        values.push(toSqlValue(patch[key]));
      }
    }
    const result = this.db
      .prepare(`UPDATE payments SET ${sets.join(', ')} WHERE id = ? AND status = ?`)
      .run(...values, id, from);
    if (result.changes !== 1) return undefined;
    this.recordHistory(id, from, to, source, now);
    return this.findById(id);
  }

  /** Update non-status fields (e.g. flag a late conflicting POS result for reconciliation). */
  patch(id: string, patch: PaymentPatch, now: string): PaymentRecord | undefined {
    const sets = ['updated_at = ?'];
    const values: SQLInputValue[] = [now];
    for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof PaymentPatch, string][]) {
      if (key in patch) {
        sets.push(`${column} = ?`);
        values.push(toSqlValue(patch[key]));
      }
    }
    this.db.prepare(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    return this.findById(id);
  }

  history(id: string): { fromStatus: string | null; toStatus: string; source: string }[] {
    return this.db
      .prepare(
        'SELECT from_status AS fromStatus, to_status AS toStatus, source FROM payment_status_history WHERE payment_id = ? ORDER BY id',
      )
      .all(id) as unknown as { fromStatus: string | null; toStatus: string; source: string }[];
  }

  private recordHistory(
    paymentId: string,
    from: PaymentStatus | null,
    to: PaymentStatus,
    source: string,
    at: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO payment_status_history (payment_id, from_status, to_status, source, at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(paymentId, from, to, source, at);
  }

  private findOne(sql: string, param: string): PaymentRecord | undefined {
    const row = this.db.prepare(sql).get(param) as unknown as PaymentRow | undefined;
    return row ? fromRow(row) : undefined;
  }
}
