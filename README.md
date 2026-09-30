# Self-Service Kiosk (portrait, POS card payments)

Touchscreen kiosk app (1080×1920 portrait) where users look up what they owe — traffic
violations by car number, service fees, certificates, case status — and pay on a physical
POS card terminal. The POS result arrives asynchronously via a signed webhook to the backend,
which pushes it to the kiosk over WebSocket.

All data is mock for now. Swapping in real APIs needs **no UI changes** — see
[Plugging in real APIs](#plugging-in-real-apis).

```
┌──────────────┐  REST + WebSocket   ┌──────────────┐  POST /transactions   ┌──────────────┐
│ apps/kiosk   │ ──────────────────► │ apps/server  │ ────────────────────► │ POS provider │
│ Electron +   │ ◄────────────────── │ Fastify +    │ ◄──────────────────── │ (apps/mock-  │
│ React        │  payment.updated    │ SQLite       │  POST /webhooks/pos   │  pos in dev) │
└──────────────┘                     └──────────────┘  (HMAC-signed)        └──────────────┘
```

| Path              | What                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `apps/kiosk`      | Electron + React + Vite + Tailwind kiosk UI (EN/AR, RTL, on-screen keyboards) |
| `apps/server`     | Fastify backend: data lookups, payment orchestration, webhooks, WebSocket     |
| `apps/mock-pos`   | Stand-in POS provider with signed webhooks and a manual control page          |
| `packages/shared` | Shared types, Zod schemas, payment state machine, `DataProvider` interface    |

## Requirements

- Node.js **22.13+** (uses the built-in `node:sqlite`; developed on Node 24) and npm 10+
- Windows 10/11 for building the installer (the app itself runs anywhere Electron does)

## Run everything locally

```bash
npm install
cp .env.example .env        # defaults work out of the box
npm run dev                 # server :4000 + mock POS :4100 + kiosk (Vite :5173 + Electron)
```

- Mock POS control page: <http://localhost:4100> — watch transactions, approve/decline by hand,
  resend webhooks (to test duplicates), change outcome mode and delay.
- `npm run dev:web` runs the kiosk UI in a normal browser instead of Electron.
- In development the Electron window is a resizable 9:16 window. Set `KIOSK_MODE=true` to try
  the locked fullscreen mode (exit with **Ctrl+Shift+Alt+Q**).

On a fresh clone npm 11 may ask you to approve install scripts; Electron's binary download is
already allow-listed in `package.json` (`allowScripts`).

### Testing payment outcomes

With `MOCK_POS_OUTCOME=auto` (default) the amount's last two digits pick the outcome:

| Amount ends in | Result                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| `.01`          | DECLINED (insufficient funds)                                           |
| `.02`          | Terminal never responds → server times out, cancels at POS → TIMEOUT    |
| `.03`          | ERROR                                                                   |
| `.04`          | APPROVED but the webhook is "lost" → server's polling fallback finds it |
| anything else  | APPROVED after `MOCK_POS_DELAY_MS` (default 5s)                         |

Demo prices are tiny for live-POS testing: each violation is 0.25 QAR (all four = 1.00 QAR) and each service fee is 1.00 QAR. Use the control page's mode selector (`decline`, `timeout`,
`manual`…) to exercise the other paths from the UI.

## Flow

Home (attract) → Service selection → Car number entry (plate type + keypad) → **static** vehicle
result (same mock vehicle + 4 violations for any plate; select one or all) → Payment summary →
Waiting for POS (live status, countdown, cancel) → Result (success with receipt / QR / print,
declined with retry, timeout/cancelled) → auto-return home after 15s.
"Other services" (fee lookup, certificate request, case status) use a generic form screen driven
by the service's field definitions and return dummy data.

Idle handling: after `IDLE_TIMEOUT_SECONDS` without a touch, an "Are you still there?" countdown
appears (15s), then the session resets and all session data is cleared. The idle timer is off on
the home screen and during the entire payment phase (creating, waiting, result).

## Payment architecture

1. Kiosk → `POST /api/payments` `{ kioskId, items, amountMinor, currency: "QAR" }` with an
   `Idempotency-Key` header (double taps don't create two payments). Amounts are **integer minor
   units** (QAR × 100) everywhere to avoid floating-point errors.
2. Server stores the payment (`CREATED`), generates a unique `merchantReference`, and calls the
   POS `POST {POS_BASE_URL}/transactions` with amount, reference, terminal ID and
   `callbackUrl = {PUBLIC_URL}/webhooks/pos` → `PENDING`. Returns `{ paymentId, payment }`.
3. Kiosk subscribes to `ws://…/payments/{paymentId}` (snapshot on connect, then updates).
4. POS → `POST /webhooks/pos`. The server
   - stores the raw body in `webhook_events` (audit log, every delivery),
   - verifies `X-Signature` = HMAC-SHA256(raw body, `POS_WEBHOOK_SECRET`) in constant time,
   - rejects timestamps outside ±`POS_WEBHOOK_TOLERANCE_SECONDS` (replay protection),
   - validates the payload with Zod, checks the approved amount matches,
   - applies it idempotently (duplicates acknowledged, final states never change; a late
     conflicting approval is flagged `needs_reconciliation`), and pushes it to the kiosk.
5. Fallbacks: at timeout the server polls `GET /transactions/{id}`; if still pending it cancels at
   the terminal and marks `TIMEOUT`. The kiosk reconnects with backoff after a WebSocket drop and
   re-fetches `GET /api/payments/{id}`; it also polls if the result is overdue. Pending payments
   are re-armed after a server restart.
6. Cancel: kiosk → `POST /api/payments/{id}/cancel` → server calls the POS cancel endpoint. If the
   terminal already approved, the approval wins.

State machine (`packages/shared/src/paymentStatus.ts`):
`CREATED → PENDING → APPROVED | DECLINED | CANCELLED | TIMEOUT | ERROR` (plus
`CREATED → CANCELLED | ERROR` when the POS never accepted the request). No transitions out of a
final state; every transition is recorded in `payment_status_history`.

Card data: only masked PANs (`**** **** **** 1234`) are stored, returned or logged; the server
re-masks whatever the provider sends, and pino redacts known sensitive keys.

## Configuration

All settings live in `.env` (see [.env.example](.env.example)). Key variables: `POS_PROVIDER`,
`POS_BASE_URL`, `POS_API_KEY`, `POS_TERMINAL_ID`, `POS_WEBHOOK_SECRET`, `PUBLIC_URL`,
`DATA_PROVIDER`, `KIOSK_ID`, `PAYMENT_TIMEOUT_SECONDS`, `IDLE_TIMEOUT_SECONDS`,
`MAX_PAYMENT_AMOUNT_MINOR` (default `100` = 1.00 QAR: any payment above it is rejected before
it reaches the POS; set `0` to remove the limit when going live).

Branding (name, logo, colours) is in one file: [apps/kiosk/src/config/branding.ts](apps/kiosk/src/config/branding.ts)
(logo: `apps/kiosk/src/assets/logo.svg`). Everything is a neutral placeholder.

## Exposing the webhook for real POS testing

The POS provider must reach `POST {PUBLIC_URL}/webhooks/pos` on the **server** (never the kiosk,
which usually sits behind NAT). Tunnel port 4000 and set `PUBLIC_URL` to the tunnel URL:

```bash
# ngrok
ngrok http 4000
# Cloudflare Tunnel (no account needed for a quick tunnel)
cloudflared tunnel --url http://localhost:4000
```

Then in `.env`: `PUBLIC_URL=https://<your-tunnel-host>`, restart the server, and register that URL
(plus the shared webhook secret) with the POS vendor if they don't take `callbackUrl` per request.
The server's `/api/debug/webhook-events` endpoint (non-production only) shows what arrived.

## Tests and quality

```bash
npm test            # Vitest: 55 unit/integration tests
npm run test:e2e    # Playwright drives the real Electron app against server + mock POS
npm run lint        # ESLint (strict typescript-eslint + react-hooks)
npm run typecheck   # strict TypeScript in every workspace
npm run format      # Prettier
```

Unit tests cover webhook signature verification and replay protection, the payment state
machine, idempotent webhook handling (duplicates, conflicts, late approvals, amount mismatch),
the timeout/polling fallback, WebSocket push, and the mock data provider. The e2e suite pays
violations end to end (kiosk → server → mock POS → signed webhook → WebSocket → success screen),
plus declined and Arabic/RTL checks. It uses its own ports (4610/4620) and a temp database.

## Windows desktop app (standalone)

```bash
npm run dist:win
# → apps/kiosk/release/Self-Service-Kiosk-Setup-<version>.exe
```

The installer is a normal install wizard (per user, no admin rights needed) that adds desktop and
Start-menu shortcuts and a regular uninstaller. The installed app is **standalone**: the server
and mock POS run inside it, so the PC needs nothing else (no Node.js). Its database and logs live
in `%APPDATA%\Self-Service Kiosk\` (`kiosk.db`, `logs/server.log`).

`npm run demo` runs the same standalone mode from source (builds, then starts one app process).

Settings: copy `kiosk.env.example` (installed next to the exe) to `kiosk.env` in the same folder
and restart. The most important one is the window mode:

| `KIOSK_WINDOW_MODE` | Behaviour                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `window` (default)  | Normal window with minimize / maximize / close; keeps 9:16 proportions when resized. For demos on a PC.                                                                          |
| `kiosk`             | Locked fullscreen for the kiosk device: no frame, Alt+F4 / F5 / F11 / F12 / Ctrl+R/W blocked, display sleep prevented, starts with Windows. Operator exit: **Ctrl+Shift+Alt+Q**. |

Built-in ports: 4800 (server) and 4900 (mock POS control page: <http://localhost:4900>), so the
installed app can run next to the dev setup (4000/4100). Set `KIOSK_EMBEDDED=false` and
`KIOSK_SERVER_URL` to use a separate server instead.

For a production device also add a code-signing certificate, replace the placeholder icon
(`apps/kiosk/build/icon.svg` / `icon.png`), and lock Windows down with Assigned Access / Shell
Launcher so the kiosk app is the only shell.

## Plugging in real APIs

**Data** — implement [`RealDataProvider`](apps/server/src/data/RealDataProvider.ts) (the
`DataProvider` interface in `packages/shared/src/DataProvider.ts`) and set `DATA_PROVIDER=real`.
Mock fixtures live in `apps/server/src/mock/fixtures/*.json`.

**POS** — implement [`RealPosProvider`](apps/server/src/pos/RealPosProvider.ts) (the
`PosProvider` interface: create / get / cancel transaction + `parseWebhook`) and set
`POS_PROVIDER=real`. Each adapter owns its vendor's wire format, auth and webhook signature
scheme and maps them to normalised types, so `PaymentService` and the kiosk don't change. The
checklist of vendor-specific decisions (auth method, field names, amount format, signature
scheme, status vocabulary) is at the top of that file.

## Production hardening (not done yet)

- Re-price items server side from the real data source instead of trusting kiosk-sent amounts
  (TODO in `PaymentService.createPayment`).
- Authenticate kiosks to the server (per-kiosk API key or mTLS) and restrict `CORS_ORIGINS`.
- Receipt printer integration (target printer by name) and a hosted e-receipt URL for the QR.
- Operational alerting on payments flagged `needs_reconciliation`.
