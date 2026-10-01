# Webhook Receiver (.NET / ASP.NET Core)

The public callback service for Noqoody payments — the **.NET Core** version. Hosts **natively on
IIS** via the ASP.NET Core Module: **no ARR, no URL Rewrite reverse proxy, no Node, no PM2.**

```
Noqoody ──POST /webhooks/pos──▶ (this) ──store──▶ webhook-results.json
Kiosk   ──GET  /result/{id} ──▶ (this) ──▶ returns the result (poll every ~1s)
```

It keeps its **own** results file (`webhook-results.json`) — it does not share the kiosk's DB.
The kiosk reads results over HTTP with `GET /result/{id}`.

## Endpoints

| Method | Path            | Purpose                                                          |
| ------ | --------------- | ---------------------------------------------------------------- |
| POST   | `/webhooks/pos` | Noqoody calls this. Verifies signature, decrypts, stores result. |
| GET    | `/result/{id}`  | Kiosk polls this. `{id}` = Noqoody `paymentId` **or** `orderId`. |
| GET    | `/health`       | Liveness check.                                                  |

`GET /result/{id}` returns `{"found":false,"status":"pending"}` until the webhook arrives, then the
full result (`status`, `paymentId`, `orderId`, `authCode`, `maskedPan`, `amount`, `terminalId`, …).

## Configure (do NOT commit real secrets)

Set as environment variables on the server (or `appsettings.json` locally):

| Setting          | What                                                       |
| ---------------- | ---------------------------------------------------------- |
| `WEBHOOK_SECRET` | Noqoody **webhookSecret** (verifies the signature)         |
| `ENCRYPTION_KEY` | Noqoody **encryptionKey** (decrypts `encryptedData`)       |
| `RESULTS_PATH`   | Results file path (default `webhook-results.json`)         |

## Run locally

```powershell
$env:WEBHOOK_SECRET="..."; $env:ENCRYPTION_KEY="..."
dotnet run
# health: http://localhost:5000/health  (or the port dotnet prints)
```

## Deploy to IIS (Windows Server) — the easy path

1. **On the server, install once:** the **ASP.NET Core Hosting Bundle** (.NET 8) from Microsoft.
   This adds the ASP.NET Core Module to IIS. (Confirm with `dotnet --info` / restart IIS: `iisreset`.)
2. **Publish** (on your dev machine):
   ```powershell
   dotnet publish -c Release -o publish
   ```
3. **Copy** the `publish` folder contents to the site's physical path (e.g. `F:\hosting\pp-callback\`).
   `dotnet publish` already generates the correct `web.config` for the ASP.NET Core Module — you do
   **not** write your own, and you do **not** need ARR or URL Rewrite.
4. In **IIS**: point the site (`pp.enoqoody.com`) at that folder. App Pool → **.NET CLR version = "No Managed Code"**.
5. Set `WEBHOOK_SECRET` and `ENCRYPTION_KEY` — either as **environment variables** for the app pool,
   or via the site's config. (Give the App Pool identity write access to the folder so
   `webhook-results.json` can be written.)
6. Test: `https://pp.enoqoody.com/health` → `{"status":"ok","service":"webhook-receiver"}`
7. In the **Noqoody console → Merchants → your merchant → Webhooks**, set the Endpoint URL to:
   `https://pp.enoqoody.com/webhooks/pos`

## How the kiosk uses it

After creating a payment the kiosk has the Noqoody `paymentId` (and its own `orderId`). It polls
`GET https://pp.enoqoody.com/result/{paymentId}` every ~1s until `found:true` with a final status
(`Completed` / `Failed` / `Cancelled` / `Timeout`), then updates the UI.

_(Wiring the kiosk's polling to this service is the next step.)_
