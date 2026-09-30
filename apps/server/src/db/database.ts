import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE payments (
    id                   TEXT PRIMARY KEY,
    kiosk_id             TEXT NOT NULL,
    merchant_reference   TEXT NOT NULL UNIQUE,
    idempotency_key      TEXT UNIQUE,
    amount_minor         INTEGER NOT NULL,
    currency             TEXT NOT NULL,
    items_json           TEXT NOT NULL,
    status               TEXT NOT NULL,
    pos_transaction_id   TEXT UNIQUE,
    auth_code            TEXT,
    masked_pan           TEXT,
    card_scheme          TEXT,
    failure_reason       TEXT,
    receipt_number       TEXT UNIQUE,
    needs_reconciliation INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    expires_at           TEXT,
    completed_at         TEXT
  );
  CREATE INDEX idx_payments_status ON payments(status);

  CREATE TABLE payment_status_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id  TEXT NOT NULL REFERENCES payments(id),
    from_status TEXT,
    to_status   TEXT NOT NULL,
    source      TEXT NOT NULL,
    at          TEXT NOT NULL
  );
  CREATE INDEX idx_history_payment ON payment_status_history(payment_id);

  CREATE TABLE webhook_events (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at        TEXT NOT NULL,
    provider           TEXT NOT NULL,
    event_id           TEXT,
    pos_transaction_id TEXT,
    payment_id         TEXT,
    signature_valid    INTEGER NOT NULL DEFAULT 0,
    outcome            TEXT NOT NULL,
    error              TEXT,
    headers_json       TEXT NOT NULL,
    raw_body           TEXT NOT NULL
  );
  CREATE INDEX idx_webhook_event_id ON webhook_events(event_id);
  `,
];

function migrate(db: DatabaseSync): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    { version: number | null } | undefined;
  const current = row?.version ?? 0;
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1;
    if (version <= current) return;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

/** Opens (and migrates) the SQLite database. Pass ':memory:' for tests. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}
