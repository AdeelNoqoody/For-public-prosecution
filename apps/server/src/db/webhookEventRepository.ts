import type { Database } from './database';

export type WebhookOutcome =
  | 'received'
  | 'rejected'
  | 'applied'
  | 'duplicate'
  | 'ignored_final_state'
  | 'unknown_transaction'
  | 'failed';

export interface WebhookEventInsert {
  receivedAt: string;
  provider: string;
  headers: Record<string, string>;
  rawBody: string;
}

export interface WebhookEventRecord {
  id: number;
  receivedAt: string;
  provider: string;
  eventId: string | null;
  posTransactionId: string | null;
  paymentId: string | null;
  signatureValid: boolean;
  outcome: WebhookOutcome;
  error: string | null;
  rawBody: string;
}

/** Append-only log of every webhook received, including the raw body, for audit/reconciliation. */
export class WebhookEventRepository {
  constructor(private readonly db: Database) {}

  insert(event: WebhookEventInsert): number {
    const result = this.db
      .prepare(
        `INSERT INTO webhook_events (received_at, provider, outcome, headers_json, raw_body)
         VALUES (?, ?, 'received', ?, ?)`,
      )
      .run(event.receivedAt, event.provider, JSON.stringify(event.headers), event.rawBody);
    return Number(result.lastInsertRowid);
  }

  update(
    id: number,
    fields: {
      outcome: WebhookOutcome;
      signatureValid?: boolean;
      eventId?: string | null;
      posTransactionId?: string | null;
      paymentId?: string | null;
      error?: string | null;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE webhook_events SET
           outcome = ?,
           signature_valid = COALESCE(?, signature_valid),
           event_id = COALESCE(?, event_id),
           pos_transaction_id = COALESCE(?, pos_transaction_id),
           payment_id = COALESCE(?, payment_id),
           error = COALESCE(?, error)
         WHERE id = ?`,
      )
      .run(
        fields.outcome,
        fields.signatureValid === undefined ? null : fields.signatureValid ? 1 : 0,
        fields.eventId ?? null,
        fields.posTransactionId ?? null,
        fields.paymentId ?? null,
        fields.error ?? null,
        id,
      );
  }

  /** True if an event with this id was already applied (or recognised as a duplicate). */
  wasProcessed(eventId: string, excludeRowId?: number): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM webhook_events
         WHERE event_id = ? AND outcome IN ('applied', 'duplicate', 'ignored_final_state') AND id != ?
         LIMIT 1`,
      )
      .get(eventId, excludeRowId ?? -1);
    return row !== undefined;
  }

  list(limit = 100): WebhookEventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, received_at, provider, event_id, pos_transaction_id, payment_id, signature_valid,
                outcome, error, raw_body
         FROM webhook_events ORDER BY id DESC LIMIT ?`,
      )
      .all(limit) as unknown as {
      id: number;
      received_at: string;
      provider: string;
      event_id: string | null;
      pos_transaction_id: string | null;
      payment_id: string | null;
      signature_valid: number;
      outcome: WebhookOutcome;
      error: string | null;
      raw_body: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      receivedAt: row.received_at,
      provider: row.provider,
      eventId: row.event_id,
      posTransactionId: row.pos_transaction_id,
      paymentId: row.payment_id,
      signatureValid: row.signature_valid === 1,
      outcome: row.outcome,
      error: row.error,
      rawBody: row.raw_body,
    }));
  }
}
