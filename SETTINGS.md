# App Settings & Configuration Reference

Every configurable value for this kiosk lives in **one file**: `.env` at the repo root
(for the installed Windows app it is `kiosk.env` next to the `.exe`). This document explains
each setting, whether it changes per merchant / per POS device, and what to update when moving
from this test setup to a real production deployment.

> 🔒 **Secrets are NOT written in this file.** The real values live in `.env` (git-ignored).
> A companion `SETTINGS.local.md` (also git-ignored) holds the current test values in one place
> for convenience. Never commit secrets to git.

---

## 1. Noqoody SmartECR (POS / card payments)

These come from Noqoody when a merchant account is created. **They are different for every
merchant and every POS device**, so all of them change when you switch to the real/production POS.

| Setting (`.env`)     | What it is                          | Changes per…      | Where to get it            |
| -------------------- | ----------------------------------- | ----------------- | -------------------------- |
| `POS_PROVIDER`       | `mock` (fake) or `real` (Noqoody)   | environment       | set `real` for live        |
| `POS_BASE_URL`       | Noqoody API base URL                | environment       | `https://smartecr-api.noqoody.qa` |
| `POS_API_KEY` 🔒     | `X-Merchant-Key` auth key           | **per merchant**  | Noqoody onboarding         |
| `POS_ENCRYPTION_KEY` 🔒 | AES-256 key (encrypt/decrypt)    | **per merchant**  | Noqoody onboarding         |
| `POS_WEBHOOK_SECRET` 🔒 | HMAC key to verify webhooks      | **per merchant**  | Noqoody onboarding         |
| `POS_MERCHANT_ID`    | Merchant ID (**MID**)               | **per merchant**  | Noqoody console            |
| `POS_TERMINAL_ID`    | **POS device id** (`posDeviceId`)   | **per device**    | Noqoody console → Devices  |

Notes:

- **MID** = `POS_MERCHANT_ID` (the merchant, e.g. `100005269900280`).
- **TID** (bank terminal id, e.g. `10050216`) is assigned by Noqoody per device and is returned in
  responses/webhooks — it is **not** something we send, so there is no env var for it.
- `POS_TERMINAL_ID` actually carries the **`posDeviceId`** (e.g. `POS-20260930-FD1C821E`), the
  physical terminal that shows the tap screen. **This is the value that changes for the real POS.**
- The webhook (callback) URL is **not** an env value on Noqoody's side — it is configured in the
  Noqoody console under **Merchants → (your merchant) → Webhooks → Endpoint URL**, and must be set
  to `{PUBLIC_URL}/webhooks/pos`.

---

## 2. Backend server

| Setting (`.env`)            | What it is                                              | Default / note |
| --------------------------- | ------------------------------------------------------- | -------------- |
| `SERVER_PORT`               | Port the backend listens on                             | `4000`         |
| `PUBLIC_URL`                | Public URL of THIS server (for the webhook callback)    | tunnel / hosted URL in prod |
| `DATA_PROVIDER`             | `mock` (fixtures) or `real` (RealDataProvider stub)     | `mock` for now |
| `DATABASE_PATH`             | SQLite database file                                    | `./data/kiosk.db` |
| `PAYMENT_TIMEOUT_SECONDS`   | How long to wait for a card result before polling       | `120`          |
| `MAX_PAYMENT_AMOUNT_MINOR`  | Max payment (minor units; `100` = 1.00 QAR). `0` = none | `100` for testing — **raise for production** |
| `LOG_LEVEL`                 | `info` / `debug` / …                                    | `info`         |
| `CORS_ORIGINS`              | Allowed origins (`*` or comma list)                     | `*` — **restrict for production** |

---

## 3. Kiosk app

| Setting (`.env`)       | What it is                                | Default |
| ---------------------- | ----------------------------------------- | ------- |
| `KIOSK_ID`             | This kiosk's id (sent with payments)      | `KIOSK-001` |
| `KIOSK_SERVER_URL`     | Backend URL the kiosk talks to            | `http://localhost:4000` |
| `IDLE_TIMEOUT_SECONDS` | Idle time before the "still there?" reset | `60`    |
| `KIOSK_MODE`           | `true` = locked fullscreen kiosk mode     | `false` |

Branding (name, logo, colours) is **not** in `.env` — it is in
`apps/kiosk/src/config/branding.ts` (currently the maroon Public Prosecution theme).

---

## 4. Local / hosted APIs (the app's own services)

These run **on the local machine** while developing. In production the backend is hosted (its own
URL) and the mock POS is not used.

| Service            | Base URL (local)          | Port | Auth today            |
| ------------------ | ------------------------- | ---- | --------------------- |
| Backend API        | `http://localhost:4000`   | 4000 | **none yet** (open on the LAN) |
| Mock POS control   | `http://localhost:4100`   | 4100 | none (dev only)       |
| Noqoody API (real) | `https://smartecr-api.noqoody.qa` | 443 | `X-Merchant-Key` header |

Key backend endpoints:

| Endpoint                                   | Method | Purpose                          |
| ------------------------------------------ | ------ | -------------------------------- |
| `/health`                                  | GET    | Server status                    |
| `/api/data/...`                            | GET    | Violations / services lookups    |
| `/api/payments`                            | POST   | Create a payment (kiosk → server)|
| `/api/payments/{id}`                       | GET    | Payment status                   |
| `/api/payments/{id}/cancel`                | POST   | Cancel a payment                 |
| `/webhooks/pos`                            | POST   | **Callback** from Noqoody        |
| `/api/debug/webhook-events`                | GET    | Received webhooks (dev only)     |

> ⚠️ **API access / password:** the local backend API currently has **no authentication** — any
> device on the same network can call it. Before production, add a per-kiosk API key (or mTLS) and
> restrict `CORS_ORIGINS`. When that is added, record the key/password in `SETTINGS.local.md`
> (never here). The only credentialed API today is Noqoody's, via `X-Merchant-Key` (= `POS_API_KEY`).

---

## 5. Production go-live checklist

When moving to the **real POS / production merchant**, update these:

1. `POS_PROVIDER=real` and `POS_BASE_URL=https://smartecr-api.noqoody.qa`
2. New per-merchant secrets: `POS_API_KEY`, `POS_ENCRYPTION_KEY`, `POS_WEBHOOK_SECRET`, `POS_MERCHANT_ID`
3. New per-device `POS_TERMINAL_ID` (the real `posDeviceId`)
4. `PUBLIC_URL` = the hosted server's real public URL; register `{PUBLIC_URL}/webhooks/pos`
   in the Noqoody console (Merchants → merchant → Webhooks)
5. `MAX_PAYMENT_AMOUNT_MINOR` = real limit (or `0` for none)
6. `CORS_ORIGINS` = the kiosk's real origin (not `*`)
7. Add authentication to the local backend API (per-kiosk key / mTLS)
8. `DATA_PROVIDER=real` once the government/challan data API is available
9. Replace the placeholder logo (`apps/kiosk/src/assets/logo.svg`) with the official one
