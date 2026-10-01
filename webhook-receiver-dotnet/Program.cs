using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

/*
 * Noqoody webhook receiver (ASP.NET Core) — the public callback service.
 *
 *   Noqoody ──POST /webhooks/pos──▶ (this) ──store──▶ webhook-results.json
 *   Kiosk   ──GET  /result/{id} ──▶ (this) ──▶ returns the result (poll every ~1s)
 *
 * Hosts natively on IIS via the ASP.NET Core Module (install the "ASP.NET Core Hosting Bundle"
 * on the server) — no ARR, no reverse proxy, no Node. See README.md.
 *
 * Config (env vars or appsettings.json):
 *   WEBHOOK_SECRET   Noqoody webhookSecret (verifies X-Webhook-Signature)
 *   ENCRYPTION_KEY   Noqoody encryptionKey (decrypts encryptedData)
 *   RESULTS_PATH     results file (default webhook-results.json)
 */

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var webhookSecret = builder.Configuration["WEBHOOK_SECRET"] ?? "";
var encryptionKey = builder.Configuration["ENCRYPTION_KEY"] ?? "";
var resultsPath = builder.Configuration["RESULTS_PATH"] ?? "webhook-results.json";

if (string.IsNullOrEmpty(webhookSecret) || string.IsNullOrEmpty(encryptionKey))
{
    app.Logger.LogCritical("Set WEBHOOK_SECRET and ENCRYPTION_KEY (env vars or appsettings.json).");
    return;
}

var store = new ResultStore(resultsPath);
var crypto = new NoqoodyCrypto(encryptionKey);

// Plain-text file log with timestamps (LOG_PATH, default logs/receiver.log next to the app).
var logPath = builder.Configuration["LOG_PATH"] ?? "logs/receiver.log";
FileLog.Init(logPath);
FileLog.Write($"=== webhook-receiver STARTED (results={resultsPath}) ===");

app.MapGet("/health", () =>
{
    FileLog.Write("GET /health");
    return Results.Ok(new { status = "ok", service = "webhook-receiver" });
});

// Kiosk polls this. {id} may be the Noqoody paymentId OR the orderId (merchantReference).
app.MapGet("/result/{id}", (string id) =>
{
    var row = store.Find(id);
    FileLog.Write($"GET /result/{id}  ->  found={(row is not null)} {(row?.Status ?? "")}");
    return row is null
        ? Results.Ok(new { found = false, status = "pending" })
        : Results.Json(row.Payload);
});

app.MapPost("/webhooks/pos", async (HttpRequest request) =>
{
    using var reader = new StreamReader(request.Body, Encoding.UTF8);
    var rawBody = await reader.ReadToEndAsync();
    var timestamp = request.Headers["X-Webhook-Timestamp"].ToString();
    var signature = request.Headers["X-Webhook-Signature"].ToString();
    var eventHeader = request.Headers["X-Webhook-Event"].ToString();

    FileLog.Write($"POST /webhooks/pos  event='{eventHeader}' ts='{timestamp}' sigLen={signature.Length} bodyLen={rawBody.Length}");

    if (!Signatures.Verify(rawBody, timestamp, signature, webhookSecret))
    {
        app.Logger.LogWarning("Rejected webhook: bad signature");
        FileLog.Write("  -> REJECTED 401: bad signature (secrets is merchant ke match nahi karte?)");
        return Results.Json(new { error = "invalid signature" }, statusCode: 401);
    }
    FileLog.Write("  -> signature OK");

    Dictionary<string, JsonElement> envelope;
    try
    {
        envelope = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(rawBody)!;
    }
    catch
    {
        FileLog.Write("  -> 400: invalid json");
        return Results.Json(new { error = "invalid json" }, statusCode: 400);
    }

    // The detail is encrypted (encryptedData) in a real delivery; plain "data" is a fallback.
    Dictionary<string, JsonElement> detail;
    try
    {
        if (envelope.TryGetValue("encryptedData", out var enc) && enc.ValueKind == JsonValueKind.String)
            detail = crypto.DecryptToDict(enc.GetString()!);
        else if (envelope.TryGetValue("data", out var d) && d.ValueKind == JsonValueKind.Object)
            detail = ToDict(d);
        else
            detail = new(StringComparer.OrdinalIgnoreCase);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Decrypt failed");
        FileLog.Write($"  -> 400: decrypt failed: {ex.Message}");
        return Results.Json(new { error = "decrypt failed" }, statusCode: 400);
    }

    string? Env(string name) =>
        envelope.TryGetValue(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    var paymentId = Env("paymentId") ?? Fields.Str(detail, "paymentId", "transactionId");
    var orderId = Fields.Str(detail, "orderId");
    var status = Env("status") ?? Fields.Str(detail, "statusText", "status") ?? "Unknown";

    var result = new
    {
        found = true,
        status,
        paymentId,
        orderId,
        authCode = Fields.Str(detail, "authCode"),
        rrn = Fields.Str(detail, "rrn"),
        pun = Fields.Str(detail, "pun"),
        maskedPan = Fields.Str(detail, "maskedPan"),
        cardScheme = Fields.Str(detail, "cardScheme"),
        amount = Fields.Num(detail, "amount"),
        currency = Fields.Str(detail, "currency"),
        terminalId = Fields.Str(detail, "terminalId"),
        posDeviceId = Fields.Str(detail, "posDeviceId"),
        errorCode = Fields.Str(detail, "errorCode"),
        customerMessage = Fields.Str(detail, "customerMessage", "errorMessage"),
        @event = Env("event"),
        receivedAt = DateTime.UtcNow.ToString("o"),
    };

    if (!string.IsNullOrEmpty(paymentId))
    {
        store.Save(paymentId!, orderId, status, result);
        app.Logger.LogInformation("Stored {Event} paymentId={PaymentId} order={OrderId}",
            result.@event ?? status, paymentId, orderId);
        FileLog.Write($"  -> STORED ✅ paymentId={paymentId} order={orderId} status={status} card={result.cardScheme} {result.maskedPan} reason={result.customerMessage}");
    }
    else
    {
        app.Logger.LogWarning("Webhook had no paymentId; not stored");
        FileLog.Write("  -> NOT stored: no paymentId in webhook");
    }

    FileLog.Write("  -> responded 200 received:true");
    return Results.Ok(new { received = true }); // 2xx quickly so Noqoody marks it delivered.
});

app.Logger.LogInformation("webhook-receiver ready — POST /webhooks/pos, GET /result/{{id}}, GET /health");
app.Run();

static Dictionary<string, JsonElement> ToDict(JsonElement obj)
{
    var d = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    foreach (var p in obj.EnumerateObject()) d[p.Name] = p.Value;
    return d;
}

// ─── Timestamped plain-text file log (.txt) ─────────────────────────────────
static class FileLog
{
    private static readonly object Gate = new();
    private static string _path = "logs/receiver.log";

    public static void Init(string path)
    {
        _path = path;
        try
        {
            var dir = Path.GetDirectoryName(Path.GetFullPath(_path));
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        }
        catch { /* ignore */ }
    }

    public static void Write(string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}  {message}{Environment.NewLine}";
        lock (Gate)
        {
            try { File.AppendAllText(_path, line); } catch { /* best-effort */ }
        }
    }
}

// ─── Signature (HMAC-SHA256 of `${timestamp}.${rawBody}`) ───────────────────
static class Signatures
{
    public static bool Verify(string rawBody, string timestamp, string signature, string secret)
    {
        if (string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(signature)) return false;
        var expected = Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{timestamp}.{rawBody}")))
            .ToLowerInvariant();
        var a = Encoding.UTF8.GetBytes(expected);
        var b = Encoding.UTF8.GetBytes(signature.Trim().ToLowerInvariant());
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
}

// ─── Case-insensitive field readers (Noqoody mixes PascalCase and camelCase) ─
static class Fields
{
    public static string? Str(Dictionary<string, JsonElement> d, params string[] names)
    {
        foreach (var n in names)
            if (d.TryGetValue(n, out var v) && v.ValueKind is JsonValueKind.String)
            {
                var s = v.GetString();
                if (!string.IsNullOrEmpty(s)) return s;
            }
        return null;
    }

    public static decimal? Num(Dictionary<string, JsonElement> d, params string[] names)
    {
        foreach (var n in names)
            if (d.TryGetValue(n, out var v))
            {
                if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var dec)) return dec;
                if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out var ds)) return ds;
            }
        return null;
    }
}

// ─── AES-256-CBC + PBKDF2 (matches Noqoody's envelope) ──────────────────────
sealed class NoqoodyCrypto
{
    private readonly byte[] _key;

    public NoqoodyCrypto(string encryptionKey)
    {
        using var kdf = new Rfc2898DeriveBytes(
            encryptionKey, Encoding.UTF8.GetBytes("POSWifiPaymentSalt"), 10000, HashAlgorithmName.SHA256);
        _key = kdf.GetBytes(32);
    }

    public Dictionary<string, JsonElement> DecryptToDict(string base64)
    {
        var raw = Convert.FromBase64String(base64);
        var iv = raw[..16];
        var cipher = raw[16..];

        using var aes = Aes.Create();
        aes.Key = _key;
        aes.IV = iv;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        using var dec = aes.CreateDecryptor();
        var plain = dec.TransformFinalBlock(cipher, 0, cipher.Length);

        using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(plain));
        return ToDict(doc.RootElement);
    }

    private static Dictionary<string, JsonElement> ToDict(JsonElement obj)
    {
        var d = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in obj.EnumerateObject()) d[p.Name] = p.Value.Clone();
        return d;
    }
}

// ─── Store: thread-safe, persisted to a JSON file (its OWN store) ───────────
sealed class ResultStore
{
    private readonly string _path;
    private readonly object _lock = new();
    private readonly ConcurrentDictionary<string, Record> _byPayment = new();
    private readonly ConcurrentDictionary<string, string> _orderToPayment = new();

    public ResultStore(string path)
    {
        _path = path;
        Load();
    }

    public Record? Find(string id)
    {
        if (_byPayment.TryGetValue(id, out var r)) return r;
        if (_orderToPayment.TryGetValue(id, out var pid) && _byPayment.TryGetValue(pid, out var r2)) return r2;
        return null;
    }

    public void Save(string paymentId, string? orderId, string status, object payload)
    {
        var rec = new Record
        {
            PaymentId = paymentId,
            OrderId = orderId,
            Status = status,
            Payload = payload,
            ReceivedAt = DateTime.UtcNow,
        };
        _byPayment[paymentId] = rec;
        if (!string.IsNullOrEmpty(orderId)) _orderToPayment[orderId!] = paymentId;
        Persist();
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var list = JsonSerializer.Deserialize<List<Record>>(File.ReadAllText(_path)) ?? new();
            foreach (var r in list)
            {
                _byPayment[r.PaymentId] = r;
                if (!string.IsNullOrEmpty(r.OrderId)) _orderToPayment[r.OrderId!] = r.PaymentId;
            }
        }
        catch { /* start fresh if the file is unreadable */ }
    }

    private void Persist()
    {
        lock (_lock)
        {
            try
            {
                File.WriteAllText(_path, JsonSerializer.Serialize(_byPayment.Values));
            }
            catch { /* best-effort persistence */ }
        }
    }

    public sealed class Record
    {
        public string PaymentId { get; set; } = "";
        public string? OrderId { get; set; }
        public string Status { get; set; } = "";
        public object Payload { get; set; } = new();
        public DateTime ReceivedAt { get; set; }
    }
}
