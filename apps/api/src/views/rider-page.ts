// Rider page (SPEC 8): no framework, large text, high contrast, thumb-sized buttons, < 100 KB.
import { en, formatNigerianPhone } from '@doorlivery/shared';
import { escapeHtml } from './customer-page.js';

export function riderPageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export interface RiderPageInput {
  nonce: string;
  businessName: string;
  status: string;
  pickupNote: string;
  postcode: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  customerName: string;
  customerPhone: string | null;
  codeLocked: boolean;
}

/** Opens the phone's maps app (Google Maps on Android, Maps/Google Maps on iPhone) at the customer's pin. */
export function mapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

const STYLE = `
  :root { --ink:#000; --bg:#fff; --muted:#333; --line:#000; --go:#0a6b2e; --warn:#8a1c1c; }
  * { box-sizing:border-box; }
  body { margin:0; font:20px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  main { max-width:520px; margin:0 auto; padding:16px; }
  h1 { font-size:1.5rem; margin:0 0 4px; }
  .status { font-weight:700; margin:0 0 16px; }
  section { border:2px solid var(--line); border-radius:12px; padding:14px; margin-bottom:14px; }
  .label { font-size:.9rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  .value { font-size:1.25rem; font-weight:600; overflow-wrap:anywhere; }
  .postcode { font-size:1.6rem; font-weight:800; letter-spacing:.05em; }
  .btn { display:block; width:100%; min-height:64px; margin:0 0 12px; padding:16px; border:2px solid var(--ink); border-radius:12px; background:var(--bg); color:var(--ink); font:inherit; font-weight:800; text-align:center; text-decoration:none; cursor:pointer; }
  .btn.go { background:var(--go); border-color:var(--go); color:#fff; }
  .btn:disabled { opacity:.4; cursor:not-allowed; }
  input { width:100%; min-height:72px; font-size:2.2rem; font-weight:800; letter-spacing:.5em; text-align:center; border:3px solid var(--ink); border-radius:12px; margin:8px 0 12px; }
  .note { font-size:1rem; margin:0 0 12px; }
  .msg { font-weight:800; color:var(--warn); margin:0 0 12px; }
  [hidden] { display:none !important; }
`;

export function renderRiderPage(p: RiderPageInput): string {
  const t = en.rider;
  const canPickUp = p.status === 'assigned';
  const canArrive = p.status === 'assigned' || p.status === 'picked_up';
  const canDeliver = ['assigned', 'picked_up', 'arrived'].includes(p.status) && !p.codeLocked;
  const done = (shown: string, isDone: boolean) => escapeHtml(isDone ? t.done : shown);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(t.title)}</title>
<style nonce="${p.nonce}">${STYLE}</style>
</head>
<body>
<main>
  <h1>${escapeHtml(t.from(p.businessName))}</h1>
  <p class="status">${escapeHtml(t.status[p.status] ?? '')}</p>

  <section>
    <div class="label">${escapeHtml(t.pickup)}</div>
    <div class="value">${escapeHtml(p.pickupNote)}</div>
  </section>

  <section>
    <div class="label">${escapeHtml(t.dropoff)}</div>
    ${
      p.postcode
        ? `<div class="postcode">${escapeHtml(p.postcode.replace(/-/g, ' '))}</div>`
        : `<div class="value">${escapeHtml(t.noPostcode)}</div>`
    }
    ${p.landmark ? `<div class="label">${escapeHtml(t.landmark)}</div><div class="value">${escapeHtml(p.landmark)}</div>` : ''}
    <div class="label">${escapeHtml(t.customer)}</div>
    <div class="value">${escapeHtml(p.customerName)}</div>
  </section>

  ${p.lat !== null && p.lng !== null ? `<a class="btn" href="${escapeHtml(mapUrl(p.lat, p.lng))}" target="_blank" rel="noopener">${escapeHtml(t.openMap)}</a>` : ''}
  ${p.customerPhone ? `<a class="btn" href="tel:+${escapeHtml(p.customerPhone)}">${escapeHtml(t.callCustomer)} · ${escapeHtml(formatNigerianPhone(p.customerPhone))}</a>` : ''}

  <button type="button" class="btn" data-event="picked_up" ${canPickUp ? '' : 'disabled'}>${done(t.pickedUp, !canPickUp)}</button>
  <button type="button" class="btn" data-event="arrived" ${canArrive ? '' : 'disabled'}>${done(t.arrived, !canArrive)}</button>

  <section>
    ${
      p.codeLocked
        ? `<p class="msg">${escapeHtml(t.locked)}</p>`
        : `<label class="label" for="code">${escapeHtml(t.codeLabel)}</label>
    <input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" ${canDeliver ? '' : 'disabled'}>
    <p class="msg" id="msg" role="alert" hidden></p>
    <p class="note">${escapeHtml(t.locationNote)}</p>
    <button type="button" class="btn go" id="delivered" ${canDeliver ? '' : 'disabled'}>${escapeHtml(t.delivered)}</button>`
    }
  </section>
</main>
<script nonce="${p.nonce}">
(function () {
  var T = ${JSON.stringify({ working: t.working, codeFormat: t.codeFormat, error: t.errorGeneric }).replace(/</g, '\\u003c')};
  var base = location.pathname.replace(/\\/$/, '');
  var busy = false;

  function post(path, body) {
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { ok: res.ok, status: res.status, body: b }; }); });
  }
  function showMsg(text) { var m = document.getElementById('msg'); if (m) { m.textContent = text; m.hidden = !text; } else if (text) { alert(text); } }

  Array.prototype.forEach.call(document.querySelectorAll('[data-event]'), function (btn) {
    btn.addEventListener('click', function () {
      if (busy) return; busy = true; btn.disabled = true; btn.textContent = T.working;
      post('/event', { event: btn.getAttribute('data-event') })
        .then(function (r) { if (!r.ok) throw new Error(r.body.message); location.reload(); })
        .catch(function (e) { busy = false; alert((e && e.message) || T.error); location.reload(); });
    });
  });

  var deliveredBtn = document.getElementById('delivered');
  if (!deliveredBtn) return;
  deliveredBtn.addEventListener('click', function () {
    var code = document.getElementById('code').value.replace(/\\D/g, '');
    if (!/^\\d{4}$/.test(code)) { showMsg(T.codeFormat); return; }
    if (busy) return; busy = true; showMsg(''); deliveredBtn.disabled = true; deliveredBtn.textContent = T.working;

    function send(pos) {
      var body = { code: code };
      if (pos) { body.lat = +pos.coords.latitude.toFixed(6); body.lng = +pos.coords.longitude.toFixed(6); body.accuracy_m = Math.round(pos.coords.accuracy); }
      post('/delivered', body).then(function (r) {
        if (r.ok || r.status === 403) { location.reload(); return; }
        busy = false; deliveredBtn.disabled = false; deliveredBtn.textContent = ${JSON.stringify(t.delivered)};
        showMsg((r.body && r.body.message) || T.error);
      }).catch(function () { busy = false; deliveredBtn.disabled = false; deliveredBtn.textContent = ${JSON.stringify(t.delivered)}; showMsg(T.error); });
    }
    // Location is asked for only now. If it's refused or slow, the delivery still completes.
    if (!navigator.geolocation) { send(null); return; }
    navigator.geolocation.getCurrentPosition(send, function () { send(null); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
})();
</script>
</body>
</html>`;
}

export function renderRiderDonePage(nonce: string, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style nonce="${nonce}">${STYLE}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p class="value">${escapeHtml(body)}</p></main></body></html>`;
}
