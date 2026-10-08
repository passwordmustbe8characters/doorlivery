// Rider page (SPEC 8): no framework, large text, high contrast, thumb-sized buttons, < 100 KB.
import { en, formatNigerianPhone, iconSvg } from '@doorlivery/shared';
import { escapeHtml, simplePage, statusBlock } from './customer-page.js';
import { DESIGN_CSS, HEAD_COMMON } from './design.js';

export function riderPageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
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
  customerName: string | null;
  customerPhone: string | null;
  codeLocked: boolean;
}

/**
 * Starts turn-by-turn navigation to the customer's pin in one tap: opens the Google Maps app if installed
 * (Android and iPhone), otherwise Google Maps on the web, with the route from the rider's current location.
 * dir_action=navigate skips the "Start" screen on mobile.
 */
export function mapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;
}

// Riders read this outdoors, often one-handed: bigger base text (text-xl), darker lines, 64px buttons.
const RIDER_CSS = `
body{font-size:20px;line-height:28px;background:var(--surface)}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:var(--s-100) var(--s-200);border-bottom:1px solid var(--line)}
.topbar .brand-mark{font-size:14px;line-height:20px}
.topbar .logo{width:24px;height:24px;border-radius:var(--r-md)}
.shell{max-width:520px;margin:0 auto;padding:var(--s-200) var(--s-200) var(--s-600)}
h1{font-size:24px;line-height:32px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s-50);margin-top:var(--s-200)}
.steps li{list-style:none;font-size:14px;line-height:20px;font-weight:600;color:var(--ink-3)}
.steps li::before{content:'';display:block;height:6px;border-radius:var(--r-full);background:var(--line);margin-bottom:var(--s-75)}
.steps li.done{color:var(--ink-2)}
.steps li.done::before{background:var(--brand)}
.steps li.current{color:var(--ink)}
.steps li.current::before{background:var(--ink)}
.steps{margin-bottom:0;padding:0}
.now{margin-top:var(--s-200);font-weight:700}
.block{margin-top:var(--s-200);border:2px solid var(--line-strong);border-radius:var(--r-2xl);padding:var(--s-200);box-shadow:none}
.block-head{display:flex;align-items:center;gap:var(--s-75);color:var(--ink-2)}
.value{margin-top:var(--s-75);font-size:20px;line-height:28px;font-weight:600;overflow-wrap:anywhere}
.postcode{margin-top:var(--s-75);font-size:30px;line-height:36px;font-weight:700;letter-spacing:.04em}
.meta{margin-top:var(--s-100);display:flex;gap:var(--s-75);align-items:flex-start;font-size:18px;line-height:28px;color:var(--ink-2)}
.meta .icon{margin-top:4px}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:var(--s-100);margin-top:var(--s-200)}
.duo .btn{flex-direction:column;gap:var(--s-50);min-height:80px;padding:var(--s-100);font-size:16px;line-height:24px;white-space:nowrap}
.btn{min-height:64px;font-size:18px;line-height:28px;border-radius:var(--r-2xl)}
.btn-secondary{border:2px solid var(--ink)}
.btn-done{background:var(--brand-soft);color:var(--brand);border:2px solid transparent;opacity:1 !important}
.actions{margin-top:var(--s-200);display:grid;gap:var(--s-100)}
.code-input{width:100%;min-height:72px;margin-top:var(--s-75);border:2px solid var(--ink);border-radius:var(--r-2xl);text-align:center;font-size:36px;line-height:40px;font-weight:700;letter-spacing:.5em;padding-left:.5em;background:var(--surface)}
.code-input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-soft)}
.code-input:disabled{background:var(--surface-2);border-color:var(--line-strong)}
.note{margin-top:var(--s-100);display:flex;gap:var(--s-75);font-size:14px;line-height:20px;color:var(--ink-2)}
.note .icon{margin-top:2px}
.msg{margin-top:var(--s-100);font-size:16px;line-height:24px}
.deliver{margin-top:var(--s-200)}
[hidden]{display:none !important}
`;

export function renderRiderPage(p: RiderPageInput): string {
  const t = en.rider;
  const canPickUp = p.status === 'assigned';
  const canArrive = p.status === 'assigned' || p.status === 'picked_up';
  const canDeliver = ['assigned', 'picked_up', 'arrived'].includes(p.status) && !p.codeLocked;
  // Progress: 0 = go to pickup, 1 = heading to customer, 2 = at the customer.
  const stage = p.status === 'assigned' ? 0 : p.status === 'picked_up' ? 1 : 2;
  const stepClass = (i: number) => (i < stage ? 'done' : i === stage ? 'current' : '');
  const stepNames = [t.pickup, t.customer, t.deliveredTitle];

  // The step the rider should do next is the solid button; finished steps show a quiet "Done" state.
  const stepButton = (event: string, label: string, icon: 'package' | 'mapPin', enabled: boolean, isNext: boolean) =>
    enabled
      ? `<button type="button" class="btn btn-block ${isNext ? 'btn-primary' : 'btn-secondary'}" data-event="${event}">${iconSvg(icon, 24)}<span>${escapeHtml(label)}</span></button>`
      : `<button type="button" class="btn btn-block btn-done" disabled>${iconSvg('check', 24)}<span>${escapeHtml(label)} · ${escapeHtml(t.done)}</span></button>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(t.title)}</title>
${HEAD_COMMON}
<style nonce="${p.nonce}">${DESIGN_CSS}${RIDER_CSS}</style>
</head>
<body>
<header class="topbar"><span class="brand-mark"><span class="logo">${iconSvg('mapPin', 14)}</span>${escapeHtml(en.brand.name)}</span><span class="text-sm muted">${escapeHtml(t.title)}</span></header>
<main class="shell" id="main">
  <h1>${escapeHtml(t.from(p.businessName))}</h1>
  <ol class="steps" aria-label="${escapeHtml(t.progress)}">${stepNames.map((n, i) => `<li class="${stepClass(i)}">${escapeHtml(n)}</li>`).join('')}</ol>
  <p class="now" aria-live="polite">${escapeHtml(t.status[p.status] ?? '')}</p>

  <section class="block">
    <div class="block-head eyebrow">${iconSvg('storefront', 20)}${escapeHtml(t.pickup)}</div>
    <div class="value">${escapeHtml(p.pickupNote)}</div>
  </section>

  <section class="block">
    <div class="block-head eyebrow">${iconSvg('mapPin', 20)}${escapeHtml(t.dropoff)}</div>
    ${
      p.postcode
        ? `<div class="postcode">${escapeHtml(p.postcode.replace(/-/g, ' '))}</div>`
        : `<div class="value">${escapeHtml(t.noPostcode)}</div>`
    }
    ${p.landmark ? `<div class="meta">${iconSvg('note', 20)}<span><span class="sr-only">${escapeHtml(t.landmark)}: </span>${escapeHtml(p.landmark)}</span></div>` : ''}
    ${p.customerName ? `<div class="meta">${iconSvg('user', 20)}<span><span class="sr-only">${escapeHtml(t.customer)}: </span>${escapeHtml(p.customerName)}</span></div>` : ''}
  </section>

  <div class="duo">
    ${p.lat !== null && p.lng !== null ? `<a class="btn btn-secondary" href="${escapeHtml(mapUrl(p.lat, p.lng))}" target="_blank" rel="noopener">${iconSvg('navigationArrow', 24)}<span>${escapeHtml(t.openMap)}</span></a>` : ''}
    ${p.customerPhone ? `<a class="btn btn-secondary" href="tel:+${escapeHtml(p.customerPhone)}" aria-label="${escapeHtml(t.callCustomer)} ${escapeHtml(formatNigerianPhone(p.customerPhone))}">${iconSvg('phone', 24)}<span>${escapeHtml(t.callCustomer)}</span></a>` : ''}
  </div>

  <div class="actions">
    ${stepButton('picked_up', t.pickedUp, 'package', canPickUp, stage === 0)}
    ${stepButton('arrived', t.arrived, 'mapPin', canArrive, stage === 1)}
  </div>
  <p class="notice notice-danger msg" id="eventMsg" role="alert" hidden></p>

  <section class="block deliver">
    ${
      p.codeLocked
        ? `<div class="notice notice-danger">${iconSvg('lockKey', 20)}<span class="semibold">${escapeHtml(t.locked)}</span></div>`
        : `<label class="field-label" for="code">${escapeHtml(t.codeLabel)}<span class="optional">${escapeHtml(t.codeHint)}</span></label>
    <input class="code-input" id="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-describedby="locNote" ${canDeliver ? '' : 'disabled'}>
    <p class="notice notice-danger msg" id="msg" role="alert" hidden></p>
    <p class="note" id="locNote">${iconSvg('crosshair', 16)}<span>${escapeHtml(t.locationNote)}</span></p>
    <button type="button" class="btn btn-primary btn-block deliver" id="delivered" ${canDeliver ? '' : 'disabled'}>${iconSvg('checkCircle', 24)}<span id="deliveredLabel">${escapeHtml(t.delivered)}</span></button>`
    }
  </section>
</main>
<script nonce="${p.nonce}">
(function () {
  var T = ${JSON.stringify({ working: t.working, codeFormat: t.codeFormat, error: t.errorGeneric, delivered: t.delivered }).replace(/</g, '\\u003c')};
  var base = location.pathname.replace(/\\/$/, '');
  var busy = false;
  var $ = function (id) { return document.getElementById(id); };

  function post(path, body) {
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { ok: res.ok, status: res.status, body: b }; }); });
  }
  function say(id, text) { var m = $(id); if (m) { m.textContent = text || ''; m.hidden = !text; } }

  Array.prototype.forEach.call(document.querySelectorAll('[data-event]'), function (btn) {
    btn.addEventListener('click', function () {
      if (busy) return; busy = true; say('eventMsg', '');
      var label = btn.querySelector('span'); var before = label.textContent;
      btn.disabled = true; label.textContent = T.working;
      post('/event', { event: btn.getAttribute('data-event') })
        .then(function (r) { if (!r.ok) throw new Error(r.body && r.body.message); location.reload(); })
        .catch(function (e) { busy = false; btn.disabled = false; label.textContent = before; say('eventMsg', (e && e.message) || T.error); });
    });
  });

  var deliveredBtn = $('delivered');
  if (!deliveredBtn) return;
  var codeInput = $('code');
  codeInput.addEventListener('input', function () { codeInput.value = codeInput.value.replace(/\\D/g, '').slice(0, 4); say('msg', ''); });

  deliveredBtn.addEventListener('click', function () {
    var code = codeInput.value.replace(/\\D/g, '');
    if (!/^\\d{4}$/.test(code)) { say('msg', T.codeFormat); codeInput.focus(); return; }
    if (busy) return; busy = true; say('msg', ''); deliveredBtn.disabled = true; $('deliveredLabel').textContent = T.working;

    function send(pos) {
      var body = { code: code };
      if (pos) { body.lat = +pos.coords.latitude.toFixed(6); body.lng = +pos.coords.longitude.toFixed(6); body.accuracy_m = Math.round(pos.coords.accuracy); }
      post('/delivered', body).then(function (r) {
        if (r.ok || r.status === 403) { location.reload(); return; }
        busy = false; deliveredBtn.disabled = false; $('deliveredLabel').textContent = T.delivered;
        say('msg', (r.body && r.body.message) || T.error);
        codeInput.select();
      }).catch(function () { busy = false; deliveredBtn.disabled = false; $('deliveredLabel').textContent = T.delivered; say('msg', T.error); });
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
  return simplePage(nonce, title, statusBlock('checkCircle', 'brand', title, body));
}
