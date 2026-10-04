// Server-rendered customer page (SPEC 8). Plain JS + Leaflet, no framework.
import { en } from '@doorlivery/shared';

const LEAFLET_CSS = {
  href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
const LEAFLET_JS = {
  src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
};

// Lagos, used until the customer shares a location or moves the pin.
const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792, zoom: 12 };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Safe to drop inside <script>: blocks "</script>" and HTML comment tricks.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/** Origin for CSP img-src, with Leaflet's {s} subdomain placeholder turned into a wildcard. */
export function tileOrigin(tileUrl: string): string {
  const m = /^(https?:\/\/[^/]+)/.exec(tileUrl);
  return m ? m[1]!.replace('{s}', '*') : "'self'";
}

export function customerPageCsp(nonce: string, tileUrl: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://unpkg.com`,
    `style-src 'nonce-${nonce}' https://unpkg.com`,
    `img-src 'self' data: https://unpkg.com ${tileOrigin(tileUrl)}`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

interface CustomerPageInput {
  nonce: string;
  businessName: string;
  tileUrl: string;
  tileAttribution: string;
}

export function renderCustomerPage({ nonce, businessName, tileUrl, tileAttribution }: CustomerPageInput): string {
  const t = en.customer;
  const clientData = {
    t,
    tileUrl,
    tileAttribution,
    center: DEFAULT_CENTER,
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(t.title)}</title>
<link rel="stylesheet" href="${LEAFLET_CSS.href}" integrity="${LEAFLET_CSS.integrity}" crossorigin="">
<style nonce="${nonce}">
  :root { --ink:#14181f; --muted:#5b6472; --line:#d9dee5; --bg:#f6f7f9; --card:#fff; --brand:#0b6e4f; --brand-ink:#fff; --warn:#8a5a00; --warn-bg:#fff4dc; --ok:#0b6e4f; --ok-bg:#e3f4ec; }
  * { box-sizing:border-box; }
  body { margin:0; font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  main { max-width:560px; margin:0 auto; padding:16px; }
  h1 { font-size:1.35rem; margin:4px 0 6px; }
  p { margin:0 0 12px; color:var(--muted); }
  button { font:inherit; border:0; border-radius:10px; padding:14px 16px; width:100%; cursor:pointer; }
  .primary { background:var(--brand); color:var(--brand-ink); font-weight:600; }
  .primary:disabled { opacity:.45; cursor:not-allowed; }
  .secondary { background:var(--card); color:var(--ink); border:1px solid var(--line); }
  #map { height:56vh; min-height:300px; border-radius:12px; border:1px solid var(--line); margin:12px 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:12px; }
  .postcode { font-size:1.6rem; font-weight:700; letter-spacing:.04em; }
  .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:.85rem; font-weight:600; margin-top:6px; }
  .badge.ok { background:var(--ok-bg); color:var(--ok); }
  .badge.warn { background:var(--warn-bg); color:var(--warn); }
  .muted { color:var(--muted); }
  .options label { display:flex; align-items:center; gap:10px; padding:10px 4px; border-top:1px solid var(--line); }
  .options label:first-of-type { border-top:0; }
  .options input { width:20px; height:20px; }
  label.field { display:block; font-weight:600; margin-bottom:6px; }
  textarea { width:100%; font:inherit; padding:10px; border:1px solid var(--line); border-radius:10px; min-height:70px; }
  .error { color:#a12020; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(t.headline(businessName))}</h1>
  <p>${escapeHtml(t.intro)}</p>
  <button type="button" class="secondary" id="locate">${escapeHtml(t.useMyLocation)}</button>
  <div id="map" role="application" aria-label="${escapeHtml(t.mapLabel)}"></div>

  <div class="card" id="status" aria-live="polite" hidden></div>

  <div class="card" id="result" hidden>
    <div class="muted">${escapeHtml(t.postcodeLabel)}</div>
    <div class="postcode" id="postcode"></div>
    <span class="badge" id="badge"></span>
  </div>

  <div class="card" id="nearby" hidden>
    <div id="nearbyTitle" class="muted"></div>
    <div class="options" id="options"></div>
  </div>

  <div class="card">
    <label class="field" for="landmark">${escapeHtml(t.landmarkLabel)}</label>
    <textarea id="landmark" maxlength="300" placeholder="${escapeHtml(t.landmarkPlaceholder)}"></textarea>
  </div>

  <button type="button" class="primary" id="confirm" disabled>${escapeHtml(t.confirm)}</button>
  <p class="error" id="error" role="alert" hidden></p>
</main>

<script src="${LEAFLET_JS.src}" integrity="${LEAFLET_JS.integrity}" crossorigin="" nonce="${nonce}"></script>
<script nonce="${nonce}">
(function () {
  var D = ${jsonForScript(clientData)};
  var t = D.t;
  var base = location.pathname.replace(/\\/$/, '');
  var $ = function (id) { return document.getElementById(id); };

  var map = L.map('map').setView([D.center.lat, D.center.lng], D.center.zoom);
  L.tileLayer(D.tileUrl, { maxZoom: 19, attribution: D.tileAttribution }).addTo(map);
  var marker = L.marker([D.center.lat, D.center.lng], { draggable: true, autoPan: true }).addTo(map);

  var state = { lat: null, lng: null, accuracy: null, result: null, chosen: null, seq: 0 };

  function show(el, on) { el.hidden = !on; }
  function setStatus(text) { $('status').textContent = text || ''; show($('status'), !!text); }
  function setError(text) { $('error').textContent = text || ''; show($('error'), !!text); }

  function updateConfirm() {
    var r = state.result;
    // A pin is always confirmable once checked; if a choice list is shown, a choice must be made.
    var ok = !!r && (!r.needs_confirmation || state.chosen !== null);
    $('confirm').disabled = !ok;
  }

  function renderResult(r) {
    state.result = r;
    state.chosen = null;
    setStatus('');
    show($('result'), r.outcome === 'found');
    if (r.outcome === 'found') {
      $('postcode').textContent = r.display;
      var high = !r.needs_confirmation;
      $('badge').textContent = high ? t.confident : t.pleaseCheck;
      $('badge').className = 'badge ' + (high ? 'ok' : 'warn');
    } else {
      setStatus(r.outcome === 'area_only' ? t.areaOnly : r.outcome === 'not_found' ? t.notFound : t.unavailable);
    }

    var opts = $('options');
    opts.textContent = '';
    if (r.needs_confirmation) {
      var items = r.nearby.slice();
      if (r.outcome === 'found' && !items.some(function (n) { return n.postcode === r.postcode; })) {
        items.unshift({ postcode: r.postcode, display: r.display, distance_m: r.distance_m });
      }
      items.forEach(function (n) { addOption(opts, n.postcode, n.display + ' · ' + Math.round(n.distance_m) + ' m'); });
      addOption(opts, '', r.outcome === 'found' ? t.noneOfThese : t.leaveBlank);
      if (r.outcome === 'found') {
        var first = opts.querySelector('input');
        if (first) { first.checked = true; state.chosen = first.value; }
      }
      $('nearbyTitle').textContent = t.chooseNearby;
    }
    show($('nearby'), r.needs_confirmation);
    updateConfirm();
  }

  function addOption(container, value, text) {
    var label = document.createElement('label');
    var input = document.createElement('input');
    input.type = 'radio'; input.name = 'postcode'; input.value = value;
    input.addEventListener('change', function () { state.chosen = value; updateConfirm(); });
    var span = document.createElement('span');
    span.textContent = text;
    label.appendChild(input); label.appendChild(span);
    container.appendChild(label);
  }

  function resolve() {
    var seq = ++state.seq;
    state.result = null; updateConfirm(); setError('');
    show($('result'), false); show($('nearby'), false);
    setStatus(t.checking);
    fetch(base + '/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: state.lat, lng: state.lng, accuracy_m: state.accuracy })
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (seq !== state.seq) return; // a newer pin move won
        if (!r.ok) { setStatus(''); setError(r.body && r.body.message ? r.body.message : t.errorGeneric); return; }
        renderResult(r.body);
      })
      .catch(function () { if (seq === state.seq) { setStatus(''); setError(t.errorGeneric); } });
  }

  function placePin(lat, lng, accuracy) {
    state.lat = +lat.toFixed(6); state.lng = +lng.toFixed(6); state.accuracy = accuracy;
    marker.setLatLng([state.lat, state.lng]);
    resolve();
  }

  marker.on('dragend', function () { var p = marker.getLatLng(); placePin(p.lat, p.lng, null); });
  map.on('click', function (e) { placePin(e.latlng.lat, e.latlng.lng, null); });

  $('locate').addEventListener('click', function () {
    if (!navigator.geolocation) { setStatus(t.locationDenied); return; }
    setStatus(t.locating);
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 18);
        placePin(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy));
      },
      function () { setStatus(t.locationDenied); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

  $('confirm').addEventListener('click', function () {
    var r = state.result;
    if (!r) return;
    var postcode = r.needs_confirmation ? state.chosen : r.postcode;
    $('confirm').disabled = true; setError('');
    $('confirm').textContent = t.confirming;
    fetch(base + '/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcode: postcode || null, lat: state.lat, lng: state.lng, accuracy_m: state.accuracy, landmark_note: $('landmark').value.trim() || null })
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body && r.body.message);
        location.reload(); // the server now renders the code screen
      })
      .catch(function (err) {
        setError((err && err.message) || t.errorGeneric);
        $('confirm').textContent = t.confirm;
        updateConfirm();
      });
  });
})();
</script>
</body>
</html>`;
}

// Small static pages (no map, no scripts).
function simplePage(nonce: string, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title>
<style nonce="${nonce}">
  body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#14181f;background:#f6f7f9}
  main{max-width:480px;margin:0 auto;padding:32px 16px}
  h1{font-size:1.3rem;margin:0 0 8px}
  .card{background:#fff;border:1px solid #d9dee5;border-radius:12px;padding:16px;margin:16px 0}
  .muted{color:#5b6472}
  .code{font-size:3rem;font-weight:800;letter-spacing:.35em;text-align:center;margin:8px 0;font-variant-numeric:tabular-nums}
  .instruction{font-weight:600;text-align:center}
</style>
</head><body><main>${body}</main></body></html>`;
}

export function renderLinkInvalidPage(nonce: string): string {
  const t = en.customer;
  return simplePage(nonce, t.linkInvalidTitle, `<h1>${escapeHtml(t.linkInvalidTitle)}</h1><p>${escapeHtml(t.linkInvalid)}</p>`);
}

interface CodePageInput {
  nonce: string;
  businessName: string;
  status: string;
  /** Null if the code can't be decrypted (e.g. the secret was rotated). */
  code: string | null;
  postcode: string | null;
  landmark: string | null;
}

export function renderCodePage({ nonce, businessName, status, code, postcode, landmark }: CodePageInput): string {
  const t = en.customer;
  const where = [postcode ? postcode.replace(/-/g, ' ') : null, landmark].filter(Boolean).map((s) => escapeHtml(s!)).join('<br>');
  const statusLine = t.statusLine[status];
  return simplePage(
    nonce,
    t.codeTitle,
    `<h1>${escapeHtml(t.codeHeadline)}</h1>
  <p class="muted">${escapeHtml(t.headline(businessName))}${statusLine ? `. ${escapeHtml(statusLine)}` : ''}</p>
  <div class="card">
    ${
      code
        ? `<div class="muted">${escapeHtml(t.codeTitle)}</div>
    <div class="code" aria-label="${escapeHtml(code.split('').join(' '))}">${escapeHtml(code)}</div>
    <p class="instruction">${escapeHtml(t.codeInstruction)}</p>`
        : `<p>${escapeHtml(t.codeUnavailable)}</p>`
    }
  </div>
  ${where ? `<div class="card"><div class="muted">${escapeHtml(t.deliverTo)}</div><div>${where}</div></div>` : ''}`,
  );
}

export function renderDeliveredPage(nonce: string): string {
  const t = en.customer;
  return simplePage(nonce, t.deliveredTitle, `<h1>${escapeHtml(t.deliveredTitle)}</h1><p>${escapeHtml(t.delivered)}</p>`);
}
