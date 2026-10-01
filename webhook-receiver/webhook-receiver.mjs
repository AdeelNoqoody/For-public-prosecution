/*
 * Noqoody webhook receiver — a small STANDALONE service (no npm dependencies).
 *
 * Purpose: this runs on a PUBLIC host and is the callback URL you register with Noqoody (ECR).
 * It verifies + decrypts each payment webhook, stores the result, and exposes a simple GET the
 * kiosk polls. The kiosk never needs to be internet-reachable.
 *
 *   Noqoody ──POST /webhooks/pos──▶ (this service) ──stores result──▶ SQLite
 *   Kiosk   ──GET  /result/{id} ──▶ (this service) ──returns result
 *
 * Run:   node webhook-receiver.mjs        (Node 18+; no npm dependencies)
 * Config (env, see .env.example): WEBHOOK_SECRET, ENCRYPTION_KEY, PORT, DB_PATH
 */
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDecipheriv, createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

// Tiny zero-dependency .env loader (only fills vars not already set in the environment).
try {
  for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* no .env file — rely on real environment variables (normal when hosted) */
}

// IIS HttpPlatformHandler passes the port in HTTP_PLATFORM_PORT.
const PORT = Number(process.env.HTTP_PLATFORM_PORT ?? process.env.PORT ?? 8080);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';
const DB_PATH = process.env.DB_PATH ?? new URL('./webhook-results.json', import.meta.url);

if (!WEBHOOK_SECRET || !ENCRYPTION_KEY) {
  console.error('FATAL: set WEBHOOK_SECRET and ENCRYPTION_KEY (see .env.example)');
  process.exit(1);
}

// ─── Store (its own JSON file — NOT shared with the kiosk; works on any Node 18+) ───
let results = {};
try {
  results = JSON.parse(readFileSync(DB_PATH, "utf8"));
} catch {
  /* first run — no file yet */
}
function saveResult(result) {
  results[result.paymentId] = result;
  writeFileSync(DB_PATH, JSON.stringify(results, null, 2));
}
function findResult(id) {
  if (results[id]) return results[id];
  return Object.values(results)
    .filter((r) => r.orderId === id)
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))[0];
}

// ─── Crypto: AES-256-CBC + PBKDF2 (matches Noqoody's envelope) ──────────────
const SALT = Buffer.from('POSWifiPaymentSalt', 'utf8');
const aesKey = pbkdf2Sync(Buffer.from(ENCRYPTION_KEY, 'utf8'), SALT, 10000, 32, 'sha256');

function decrypt(b64) {
  const raw = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-cbc', aesKey, raw.subarray(0, 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString('utf8'));
}

/** HMAC-SHA256(`${timestamp}.${rawBody}`) hex, constant-time compare. */
function signatureValid(rawBody, timestamp, signature) {
  if (!timestamp || !signature) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Case-insensitive field read (Noqoody mixes PascalCase and camelCase). */
function field(obj, ...names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const low = {};
  for (const [k, v] of Object.entries(obj)) low[k.toLowerCase()] = v;
  for (const n of names) {
    const v = low[n.toLowerCase()];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

// ─── HTTP server ────────────────────────────────────────────────────────────
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok', service: 'webhook-receiver' });
  }

  // Kiosk polls this. {id} may be the Noqoody paymentId OR the orderId (merchantReference).
  if (req.method === 'GET' && url.pathname.startsWith('/result/')) {
    const id = decodeURIComponent(url.pathname.slice('/result/'.length));
    const row = findResult(id);
    if (!row) return send(res, 200, { found: false, status: 'pending' });
    return send(res, 200, { found: true, ...row });
  }

  if (req.method === 'POST' && url.pathname === '/webhooks/pos') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const timestamp = req.headers['x-webhook-timestamp'];
      const signature = req.headers['x-webhook-signature'];

      if (!signatureValid(rawBody, timestamp, signature)) {
        console.warn('Rejected webhook: bad signature');
        return send(res, 401, { error: 'invalid signature' });
      }

      let envelope;
      try {
        envelope = JSON.parse(rawBody);
      } catch {
        return send(res, 400, { error: 'invalid json' });
      }

      let detail = {};
      try {
        if (envelope.encryptedData) detail = decrypt(envelope.encryptedData);
        else if (envelope.data) detail = envelope.data;
      } catch (e) {
        console.error('Decrypt failed:', String(e));
        return send(res, 400, { error: 'decrypt failed' });
      }

      const paymentId = envelope.paymentId ?? field(detail, 'paymentId', 'transactionId');
      const orderId = field(detail, 'orderId') ?? null;
      const status = envelope.status ?? field(detail, 'statusText', 'status') ?? 'Unknown';
      const result = {
        paymentId,
        orderId,
        status,
        authCode: field(detail, 'authCode') ?? null,
        rrn: field(detail, 'rrn') ?? null,
        pun: field(detail, 'pun') ?? null,
        maskedPan: field(detail, 'maskedPan') ?? null,
        cardScheme: field(detail, 'cardScheme') ?? null,
        amount: field(detail, 'amount') ?? null,
        currency: field(detail, 'currency') ?? null,
        terminalId: field(detail, 'terminalId') ?? null,
        posDeviceId: field(detail, 'posDeviceId') ?? null,
        errorCode: field(detail, 'errorCode') ?? null,
        customerMessage: field(detail, 'customerMessage', 'errorMessage') ?? null,
        event: envelope.event ?? null,
        receivedAt: new Date().toISOString(),
      };

      if (paymentId) {
        saveResult(result);
        console.log(`Stored ${envelope.event ?? status} paymentId=${paymentId} order=${orderId}`);
      } else {
        console.warn('Webhook had no paymentId; not stored');
      }
      // Always 2xx quickly so Noqoody marks it delivered.
      return send(res, 200, { received: true });
    });
    return;
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`webhook-receiver listening on :${PORT}`);
  console.log(`  callback URL to register with Noqoody:  <public-url>/webhooks/pos`);
  console.log(`  kiosk polls:  <public-url>/result/{paymentId or orderId}`);
});
