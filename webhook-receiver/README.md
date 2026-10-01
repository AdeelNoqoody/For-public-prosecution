# Webhook Receiver (Noqoody callback service)

A small **standalone** service (zero npm dependencies — only Node built-ins) that runs on a
**public host** and is the callback URL you register with Noqoody. It verifies + decrypts each
payment webhook, stores the result, and lets the kiosk poll for it. The kiosk itself never has to
be reachable from the internet.

```
Noqoody ──POST /webhooks/pos──▶ webhook-receiver ──store──▶ its own SQLite
Kiosk   ──GET  /result/{id} ──▶ webhook-receiver ──▶ returns the result (poll every ~1s)
```

## What it does NOT share

It keeps its **own** results database (`webhook-results.db`) — it does **not** share the kiosk's
database. The kiosk reads results by calling `GET /result/{id}` over HTTP.

## Requirements

- Node.js **22.13+** (uses the built-in `node:sqlite`).

## Configure

Copy `.env.example` to `.env` (or set real environment variables on your host):

| Variable         | What                                                            |
| ---------------- | -------------------------------------------------------------- |
| `WEBHOOK_SECRET` | Noqoody **webhookSecret** (verifies the signature)             |
| `ENCRYPTION_KEY` | Noqoody **encryptionKey** (decrypts `encryptedData`)           |
| `PORT`           | Port to listen on (default 8080; your host may override)       |
| `DB_PATH`        | Results DB file (default `./webhook-results.db`)               |

> These must be the **same** credentials as the merchant whose payments arrive here.

## Run

```bash
node webhook-receiver.mjs
# or: npm start
```

## Endpoints

| Method | Path                | Purpose                                                            |
| ------ | ------------------- | ----------------------------------------------------------------- |
| POST   | `/webhooks/pos`     | Noqoody calls this. Verifies signature, decrypts, stores result.  |
| GET    | `/result/{id}`      | Kiosk polls this. `{id}` = Noqoody `paymentId` **or** `orderId`.  |
| GET    | `/health`           | Liveness check.                                                   |

### `GET /result/{id}` responses

Not received yet (keep polling):
```json
{ "found": false, "status": "pending" }
```

Received:
```json
{
  "found": true,
  "status": "Completed",
  "paymentId": "…",
  "orderId": "KSK-…",
  "authCode": "A12345",
  "maskedPan": "**** **** **** 4567",
  "cardScheme": "Visa",
  "amount": 1, "currency": "QAR",
  "terminalId": "10050216",
  "posDeviceId": "POS-…",
  "receivedAt": "2026-09-30T…"
}
```

## Hosting

1. Deploy this folder to any public host (a small VPS, Render, Railway, Azure App Service, etc.).
2. Set `WEBHOOK_SECRET` and `ENCRYPTION_KEY` as environment variables.
3. Note the public URL, e.g. `https://pp-callback.example.com`.
4. In the **Noqoody console → Merchants → your merchant → Webhooks**, set the Endpoint URL to:
   `https://pp-callback.example.com/webhooks/pos`

## How the kiosk uses it

After creating a payment, the kiosk has the Noqoody `paymentId` (and its own `orderId`). It polls
`GET https://<this-host>/result/{paymentId}` every ~1 second until `found: true` with a final
status (`Completed` / `Failed` / `Cancelled` / `Timeout`), then updates the UI.

_(Wiring the kiosk's polling to this service is the next step — tell the maintainer to enable it.)_
