/** Tiny self-contained control page for driving the mock terminal by hand. */
export const CONTROL_PAGE_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mock POS Terminal</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --text:#1b1f24; --muted:#5b6470; --line:#dde1e6;
          --ok:#1a7f37; --bad:#c62828; --warn:#9a6700; --accent:#2455c3; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111418; --card:#1a1f25; --text:#e8ebef; --muted:#9aa4af; --line:#2c333b; } }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.45 system-ui, sans-serif; background:var(--bg); color:var(--text); }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: var(--muted); margin: 0 0 20px; }
  .card { background: var(--card); border:1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:end; }
  label { display:flex; flex-direction:column; gap:4px; color:var(--muted); font-size:12px; }
  select, input { font: inherit; padding: 6px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--text); }
  button { font: inherit; padding: 6px 10px; border-radius:6px; border:1px solid var(--line); background:var(--bg); color:var(--text); cursor:pointer; }
  button.ok { border-color: var(--ok); color: var(--ok); }
  button.bad { border-color: var(--bad); color: var(--bad); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .table-wrap { overflow-x: auto; }
  table { width:100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align:left; padding: 8px 6px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; }
  .st { font-weight: 600; }
  .st.PENDING { color: var(--warn); } .st.APPROVED { color: var(--ok); }
  .st.DECLINED, .st.ERROR, .st.CANCELLED { color: var(--bad); }
  .actions { display:flex; gap:6px; }
  .empty { color: var(--muted); padding: 12px 0; }
  code { font-size: 12px; }
</style>
</head>
<body>
<main>
  <h1>Mock POS Terminal</h1>
  <p class="sub">Simulates the card terminal provider. Auto mode picks the outcome from the amount's last two digits:
    <code>.01</code> declined · <code>.02</code> no response (timeout) · <code>.03</code> error · <code>.04</code> approved without webhook · otherwise approved.</p>

  <section class="card">
    <div class="row">
      <label>Outcome mode
        <select id="outcome">
          <option value="auto">auto (by amount)</option>
          <option value="approve">approve</option>
          <option value="decline">decline</option>
          <option value="error">error</option>
          <option value="timeout">timeout (never respond)</option>
          <option value="manual">manual (use buttons below)</option>
        </select>
      </label>
      <label>Delay (ms)<input id="delay" type="number" min="0" step="500" /></label>
      <button class="primary" id="save">Save settings</button>
      <span id="saved" class="sub"></span>
    </div>
  </section>

  <section class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Transaction</th><th>Reference</th><th>Amount</th><th>Status</th><th>Card</th><th>Webhooks</th><th>Created</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div id="empty" class="empty">No transactions yet. Start a payment on the kiosk.</div>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  let settingsLoaded = false;

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    if (!res.ok) alert('Request failed: ' + res.status + ' ' + (await res.text()));
    return res;
  }

  function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function button(label, className, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    if (className) b.className = className;
    b.addEventListener('click', onClick);
    return b;
  }

  async function refresh() {
    const res = await fetch('/control/state');
    const state = await res.json();
    if (!settingsLoaded) {
      $('outcome').value = state.settings.outcome;
      $('delay').value = state.settings.delayMs;
      settingsLoaded = true;
    }
    const rows = $('rows');
    rows.replaceChildren();
    $('empty').style.display = state.transactions.length ? 'none' : 'block';
    for (const tx of state.transactions) {
      const tr = document.createElement('tr');
      tr.append(
        cell(tx.transactionId),
        cell(tx.merchantReference),
        cell((tx.amountMinor / 100).toFixed(2) + ' ' + tx.currency),
        cell(tx.status + (tx.reason ? ' (' + tx.reason + ')' : ''), 'st ' + tx.status),
        cell(tx.maskedPan ? tx.cardScheme + ' ' + tx.maskedPan.slice(-4) : '—'),
        cell(tx.webhooksSent + (tx.lastWebhookStatus ? ' → ' + tx.lastWebhookStatus : '')),
        cell(new Date(tx.createdAt).toLocaleTimeString()),
      );
      const actions = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.className = 'actions';
      const complete = (status, reason) => () =>
        post('/control/transactions/' + tx.transactionId + '/complete', { status, reason }).then(refresh);
      if (tx.status === 'PENDING') {
        wrap.append(
          button('Approve', 'ok', complete('APPROVED')),
          button('Decline', 'bad', complete('DECLINED', 'DO_NOT_HONOUR')),
          button('Error', 'bad', complete('ERROR', 'TERMINAL_ERROR')),
          button('Approve silently', '', () =>
            post('/control/transactions/' + tx.transactionId + '/complete', { status: 'APPROVED', sendWebhook: false }).then(refresh)),
        );
      } else {
        wrap.append(button('Resend webhook', '', () =>
          post('/control/transactions/' + tx.transactionId + '/resend-webhook').then(refresh)));
      }
      actions.append(wrap);
      tr.append(actions);
      rows.append(tr);
    }
  }

  $('save').addEventListener('click', async () => {
    await post('/control/settings', { outcome: $('outcome').value, delayMs: Number($('delay').value) });
    $('saved').textContent = 'Saved';
    setTimeout(() => ($('saved').textContent = ''), 1500);
  });

  refresh();
  setInterval(refresh, 1000);
</script>
</body>
</html>`;
