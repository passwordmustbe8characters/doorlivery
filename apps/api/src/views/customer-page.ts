// Server-rendered customer page (SPEC 8). Plain JS + Leaflet, no framework. Styled with the shared design system.
import { en, iconSvg, type IconName } from '@doorlivery/shared';
import { DESIGN_CSS, HEAD_COMMON } from './design.js';

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
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const PAGE_CSS = `
.topbar{display:flex;align-items:center;justify-content:center;padding:var(--s-100) var(--s-200)}
.topbar .brand-mark{font-size:14px;line-height:20px}
.topbar .logo{width:24px;height:24px;border-radius:var(--r-md)}
.shell{max-width:560px;margin:0 auto;padding:0 var(--s-200) var(--s-400)}
.intro{padding:var(--s-200) 0 var(--s-300)}
.intro h1{font-size:24px;line-height:32px}
.intro p{margin-top:var(--s-75);color:var(--ink-2)}
.map-card{position:relative;height:52vh;min-height:320px;border:1px solid var(--line);border-radius:var(--r-2xl);overflow:hidden;box-shadow:var(--shadow-sm);background:var(--surface-2)}
#map{position:absolute;inset:0}
.leaflet-container{font-family:inherit}
.map-hint{position:absolute;top:var(--s-100);left:var(--s-100);right:var(--s-100);z-index:500;display:flex;justify-content:center;pointer-events:none}
.map-hint span{display:inline-flex;align-items:center;gap:var(--s-50);background:var(--surface);color:var(--ink-2);border-radius:var(--r-full);padding:var(--s-50) var(--s-100);font-size:14px;line-height:20px;font-weight:600;box-shadow:var(--shadow-sm)}
.map-locate{position:absolute;right:var(--s-100);bottom:var(--s-400);z-index:500;box-shadow:var(--shadow-lg)}
.leaflet-bottom.leaflet-left{bottom:var(--s-300)}
.pin{color:var(--brand);filter:drop-shadow(0 4px 6px rgba(21,23,26,.3))}
.panel{margin-top:var(--s-200)}
.postcode{font-size:30px;line-height:36px;font-weight:700;letter-spacing:.04em;margin-top:var(--s-50)}
.result-row{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s-100)}
.result-row .badge{margin-top:var(--s-50)}
fieldset{border:0;margin:0;padding:0;min-width:0}
legend{padding:0;font-size:14px;line-height:20px;font-weight:600;margin-bottom:var(--s-75)}
.options{display:grid;gap:var(--s-75)}
.option{display:flex;align-items:center;gap:var(--s-100);padding:var(--s-100) var(--s-200);background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--r-xl);cursor:pointer;transition:border-color 200ms ease,background-color 200ms ease,transform var(--press) var(--ease-out)}
.option:active{transform:scale(.98)}
.option input{width:20px;height:20px;margin:0;accent-color:var(--brand);flex:none}
.option .code{font-weight:600;letter-spacing:.03em}
.option .dist{margin-left:auto;font-size:14px;line-height:20px;color:var(--ink-3)}
.option:has(input:checked){border-color:var(--brand);background:var(--brand-soft)}
.option:has(input:focus-visible){outline:2px solid var(--brand);outline-offset:2px}
.confirm-bar{position:sticky;bottom:0;margin-top:var(--s-300);padding:var(--s-100) 0 calc(var(--s-100) + env(safe-area-inset-bottom));background:var(--bg)}
.confirm-bar .hint{margin-top:var(--s-75);text-align:center;font-size:14px;line-height:20px;color:var(--ink-3)}
.confirm-bar .field-error{text-align:center}
.footer-note{margin-top:var(--s-300);text-align:center;font-size:12px;line-height:16px;color:var(--ink-3)}
.center-page{max-width:480px;margin:0 auto;padding:var(--s-400) var(--s-200) var(--s-600);text-align:center}
.center-page h1{font-size:24px;line-height:32px;margin-top:var(--s-200)}
.center-page .lead{margin-top:var(--s-75);color:var(--ink-2)}
.hero-icon{display:grid;place-items:center;width:64px;height:64px;margin:0 auto;border-radius:var(--r-full)}
.hero-icon.brand{background:var(--brand-soft);color:var(--brand)}
.hero-icon.warn{background:var(--warn-soft);color:var(--warn)}
.hero-icon.danger{background:var(--danger-soft);color:var(--danger)}
.code-card{margin-top:var(--s-300);text-align:center}
.code-tiles{display:flex;justify-content:center;gap:var(--s-100);margin:var(--s-200) 0}
.code-tiles span{display:grid;place-items:center;width:56px;height:72px;border:1px solid var(--line-strong);border-radius:var(--r-xl);background:var(--surface);font-size:48px;line-height:1;font-weight:700}
.where{margin-top:var(--s-200);text-align:left}
.where-rows{margin-top:var(--s-75)}
.where-row{display:flex;gap:var(--s-100);align-items:flex-start}
.where-row + .where-row{margin-top:var(--s-100)}
.where-row .icon{margin-top:2px;color:var(--ink-3)}
.status-pill{display:inline-flex;align-items:center;gap:var(--s-75);margin-top:var(--s-200);padding:var(--s-75) var(--s-100);border-radius:var(--r-full);background:var(--surface);border:1px solid var(--line);font-size:14px;line-height:20px;font-weight:600;color:var(--ink-2)}
.status-pill .icon{color:var(--brand)}
[hidden]{display:none !important}
`;

/** Brand bar shown at the top of every customer-facing page. */
function topbar(): string {
  return `<header class="topbar"><span class="brand-mark"><span class="logo">${iconSvg('mapPin', 14)}</span>${escapeHtml(en.brand.name)}</span></header>`;
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
    pinSvg: iconSvg('mapPin', 44, 'pin'),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(t.title)}</title>
${HEAD_COMMON}
<link rel="stylesheet" href="${LEAFLET_CSS.href}" integrity="${LEAFLET_CSS.integrity}" crossorigin="">
<style nonce="${nonce}">${DESIGN_CSS}${PAGE_CSS}</style>
</head>
<body>
${topbar()}
<main class="shell" id="main">
  <section class="intro">
    <h1>${escapeHtml(t.headline(businessName))}</h1>
    <p>${escapeHtml(t.intro)}</p>
  </section>

  <div class="map-card">
    <div id="map" role="application" aria-label="${escapeHtml(t.mapLabel)}"></div>
    <div class="map-hint" id="mapHint"><span>${iconSvg('mapPin', 16)}${escapeHtml(t.confirmHint)}</span></div>
    <button type="button" class="btn btn-secondary btn-sm map-locate" id="locate">${iconSvg('crosshair', 20)}<span>${escapeHtml(t.useMyLocation)}</span></button>
  </div>

  <div class="notice notice-info panel appear" id="status" role="status" aria-live="polite" hidden></div>

  <section class="card panel appear" id="result" hidden>
    <div class="result-row">
      <div>
        <div class="eyebrow">${escapeHtml(t.postcodeLabel)}</div>
        <div class="postcode" id="postcode"></div>
      </div>
      <span class="badge" id="badge"></span>
    </div>
  </section>

  <section class="panel appear" id="nearby" hidden>
    <fieldset>
      <legend id="nearbyTitle"></legend>
      <div class="options" id="options"></div>
    </fieldset>
  </section>

  <div class="field panel">
    <label class="field-label" for="landmark">${escapeHtml(t.landmarkLabel)}<span class="optional">${escapeHtml(t.landmarkOptional)}</span></label>
    <textarea class="input" id="landmark" maxlength="300" rows="2" placeholder="${escapeHtml(t.landmarkPlaceholder)}"></textarea>
  </div>

  <div class="confirm-bar">
    <button type="button" class="btn btn-primary btn-block" id="confirm" disabled>${iconSvg('check', 20)}<span id="confirmLabel">${escapeHtml(t.confirm)}</span></button>
    <p class="hint" id="confirmHint">${escapeHtml(t.confirmHint)}</p>
    <p class="field-error" id="error" role="alert" hidden></p>
  </div>
</main>

<script src="${LEAFLET_JS.src}" integrity="${LEAFLET_JS.integrity}" crossorigin="" nonce="${nonce}"></script>
<script nonce="${nonce}">
(function () {
  var D = ${jsonForScript(clientData)};
  var t = D.t;
  var base = location.pathname.replace(/\\/$/, '');
  var $ = function (id) { return document.getElementById(id); };

  // Zoom buttons bottom-left: the hint pill owns the top edge, "Use my location" the bottom-right.
  var map = L.map('map', { zoomControl: false }).setView([D.center.lat, D.center.lng], D.center.zoom);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer(D.tileUrl, { maxZoom: 19, attribution: D.tileAttribution }).addTo(map);
  var pinIcon = L.divIcon({ html: D.pinSvg, className: '', iconSize: [44, 44], iconAnchor: [22, 42] });
  var marker = L.marker([D.center.lat, D.center.lng], { draggable: true, autoPan: true, icon: pinIcon, keyboard: true, title: t.mapLabel }).addTo(map);

  var state = { lat: null, lng: null, accuracy: null, result: null, chosen: null, seq: 0 };

  function show(el, on) { el.hidden = !on; }
  function setStatus(text, tone) {
    var s = $('status');
    s.textContent = text || '';
    s.className = 'notice panel appear notice-' + (tone || 'info');
    show(s, !!text);
  }
  function setError(text) { $('error').textContent = text || ''; show($('error'), !!text); }

  function updateConfirm() {
    var r = state.result;
    // A pin is always confirmable once checked; if a choice list is shown, a choice must be made.
    var ok = !!r && (!r.needs_confirmation || state.chosen !== null);
    $('confirm').disabled = !ok;
    show($('confirmHint'), !r);
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
      $('badge').className = 'badge ' + (high ? 'badge-brand' : 'badge-warn');
    } else {
      setStatus(r.outcome === 'area_only' ? t.areaOnly : r.outcome === 'not_found' ? t.notFound : t.unavailable, 'warn');
    }

    var opts = $('options');
    opts.textContent = '';
    if (r.needs_confirmation) {
      var items = r.nearby.slice();
      if (r.outcome === 'found' && !items.some(function (n) { return n.postcode === r.postcode; })) {
        items.unshift({ postcode: r.postcode, display: r.display, distance_m: r.distance_m });
      }
      items.forEach(function (n) { addOption(opts, n.postcode, n.display, Math.round(n.distance_m) + ' m'); });
      addOption(opts, '', r.outcome === 'found' ? t.noneOfThese : t.leaveBlank, '');
      if (r.outcome === 'found') {
        var first = opts.querySelector('input');
        if (first) { first.checked = true; state.chosen = first.value; }
      }
      $('nearbyTitle').textContent = t.chooseNearby;
    }
    show($('nearby'), r.needs_confirmation);
    updateConfirm();
  }

  function addOption(container, value, text, dist) {
    var label = document.createElement('label');
    label.className = 'option';
    var input = document.createElement('input');
    input.type = 'radio'; input.name = 'postcode'; input.value = value;
    input.addEventListener('change', function () { state.chosen = value; updateConfirm(); });
    var span = document.createElement('span');
    span.className = value ? 'code' : '';
    span.textContent = text;
    label.appendChild(input); label.appendChild(span);
    if (dist) { var d = document.createElement('span'); d.className = 'dist'; d.textContent = dist; label.appendChild(d); }
    container.appendChild(label);
  }

  function resolve() {
    var seq = ++state.seq;
    state.result = null; updateConfirm(); setError('');
    show($('result'), false); show($('nearby'), false);
    setStatus(t.checking, 'info');
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
    show($('mapHint'), false);
    resolve();
  }

  marker.on('dragend', function () { var p = marker.getLatLng(); placePin(p.lat, p.lng, null); });
  map.on('click', function (e) { placePin(e.latlng.lat, e.latlng.lng, null); });

  $('locate').addEventListener('click', function () {
    if (!navigator.geolocation) { setStatus(t.locationDenied, 'warn'); return; }
    setStatus(t.locating, 'info');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 18);
        placePin(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy));
      },
      function () { setStatus(t.locationDenied, 'warn'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

  $('confirm').addEventListener('click', function () {
    var r = state.result;
    if (!r) return;
    var postcode = r.needs_confirmation ? state.chosen : r.postcode;
    $('confirm').disabled = true; setError('');
    $('confirmLabel').textContent = t.confirming;
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
        $('confirmLabel').textContent = t.confirm;
        updateConfirm();
      });
  });
})();
</script>
</body>
</html>`;
}

/** Small static pages (no map, no scripts): status pages, code screen, errors. */
export function simplePage(nonce: string, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title>
${HEAD_COMMON}
<style nonce="${nonce}">${DESIGN_CSS}${PAGE_CSS}</style>
</head><body>${topbar()}<main class="center-page appear" id="main">${body}</main></body></html>`;
}

/** Icon in a soft circle, a title and a line of explanation: the shape of every status page. */
export function statusBlock(icon: IconName, tone: 'brand' | 'warn' | 'danger', title: string, lead: string): string {
  return `<div class="hero-icon ${tone}">${iconSvg(icon, 32)}</div><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(lead)}</p>`;
}

export function renderLinkInvalidPage(nonce: string): string {
  const t = en.customer;
  return simplePage(nonce, t.linkInvalidTitle, statusBlock('warning', 'warn', t.linkInvalidTitle, t.linkInvalid));
}

// Live order screen (after confirming). Steps shown in the dark strip's pill.
const ORDER_STEPS = ['ready', 'assigned', 'picked_up', 'arrived'];

/** What the live strip and heading say for a status (also served as JSON to the polling script). */
export function orderStatusView(status: string) {
  const t = en.customer;
  const n = ORDER_STEPS.indexOf(status) + 1;
  return {
    line: t.statusLine[status] ?? '',
    title: t.statusTitle[status] ?? t.codeHeadline,
    step: n > 0 ? t.step(n, ORDER_STEPS.length) : '',
  };
}

const ORDER_CSS = `
.order{background:var(--surface)}
.order-map{position:relative;height:44vh;min-height:260px;background:var(--surface-2)}
.order-map #map{position:absolute;inset:0}
.order-map .leaflet-bottom{bottom:var(--s-300)}
.order-map .chip{position:absolute;top:calc(var(--s-100) + env(safe-area-inset-top));left:var(--s-200);z-index:500;background:var(--surface);border-radius:var(--r-full);padding:var(--s-50) var(--s-100) var(--s-50) var(--s-50);box-shadow:var(--shadow-sm);font-size:14px;line-height:20px}
.order-map .chip .logo{width:24px;height:24px;border-radius:var(--r-full)}
.sheet{position:relative;z-index:600;margin-top:calc(-1 * var(--s-300))}
.live-strip{display:flex;align-items:center;gap:var(--s-100);background:var(--ink);color:#fff;border-radius:var(--r-3xl) var(--r-3xl) 0 0;padding:var(--s-200) var(--s-200) var(--s-500)}
.live-dot{flex:none;width:8px;height:8px;border-radius:var(--r-full);background:#5ee0a8;box-shadow:0 0 0 4px rgba(94,224,168,.2)}
.live-line{flex:1;min-width:0;font-size:14px;line-height:20px;font-weight:600;white-space:pre-wrap}
.step-pill{flex:none;font-size:12px;line-height:16px;font-weight:600;color:#fff;background:rgba(255,255,255,.14);border-radius:var(--r-full);padding:var(--s-50) var(--s-100)}
.sheet-card{background:var(--surface);border-radius:var(--r-3xl) var(--r-3xl) 0 0;margin-top:calc(-1 * var(--s-300));padding:var(--s-300) var(--s-200) var(--s-600);max-width:640px;margin-left:auto;margin-right:auto}
.sheet-card h1{font-size:24px;line-height:32px;transition:opacity 200ms ease}
.sheet-card h1.swap{opacity:0}
.sheet-card .lead{margin-top:var(--s-50);color:var(--ink-2)}
.divider{height:1px;background:var(--line);margin:var(--s-300) 0}
.code-head{display:flex;align-items:center;justify-content:space-between}
.code-tiles{display:flex;justify-content:center;gap:var(--s-100);margin:var(--s-200) 0}
.tile{position:relative;width:56px;height:72px;overflow:hidden;border:1px solid var(--line-strong);border-radius:var(--r-xl);background:var(--surface)}
.reel{display:flex;flex-direction:column}
.reel span{display:grid;place-items:center;height:72px;font-size:48px;line-height:1;font-weight:700}
${Array.from({ length: 10 }, (_, n) => `.to-${n}{transform:translateY(${-72 * (10 + n)}px)}`).join('')}
.route{margin-top:var(--s-300)}
.stop{position:relative;display:grid;grid-template-columns:20px 1fr;column-gap:var(--s-100)}
.stop + .stop{margin-top:var(--s-200)}
.stop .icon{grid-row:span 2;color:var(--brand);margin-top:2px}
.stop > :not(.icon){grid-column:2}
.stop:first-child::after{content:'';position:absolute;left:9px;top:26px;height:calc(100% - 8px);border-left:2px dotted var(--line-strong)}
.stop .label{font-size:12px;line-height:16px;color:var(--ink-3)}
.stop .value{font-weight:600}
.stop .sub{color:var(--ink-2);font-size:14px;line-height:20px}
.live-note{margin-top:var(--s-300);text-align:center;font-size:12px;line-height:16px;color:var(--ink-3)}
@media (prefers-reduced-motion: reduce){.live-dot{box-shadow:none}}
`;

interface CodePageInput {
  nonce: string;
  businessName: string;
  status: string;
  /** Null if the code can't be decrypted (e.g. the secret was rotated). */
  code: string | null;
  postcode: string | null;
  landmark: string | null;
  lat?: number | null;
  lng?: number | null;
  tileUrl?: string;
  tileAttribution?: string;
}

/** One reel per digit: 0-9 twice, parked on the target in the second run, so the roll passes a full cycle. */
function reel(digit: string): string {
  const cells = Array.from({ length: 20 }, (_, i) => `<span>${i % 10}</span>`).join('');
  return `<span class="tile" aria-hidden="true"><span class="reel to-${escapeHtml(digit)}">${cells}</span></span>`;
}

export function renderCodePage(p: CodePageInput): string {
  const t = en.customer;
  const view = orderStatusView(p.status);
  const hasMap = p.lat != null && p.lng != null && !!p.tileUrl;
  const clientData = {
    lat: p.lat,
    lng: p.lng,
    tileUrl: p.tileUrl,
    tileAttribution: p.tileAttribution,
    pinSvg: iconSvg('mapPin', 44, 'pin'),
    status: p.status,
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(t.codeTitle)}</title>
${HEAD_COMMON}
${hasMap ? `<link rel="stylesheet" href="${LEAFLET_CSS.href}" integrity="${LEAFLET_CSS.integrity}" crossorigin="">` : ''}
<style nonce="${p.nonce}">${DESIGN_CSS}${PAGE_CSS}${ORDER_CSS}</style>
</head>
<body class="order">
${
  hasMap
    ? `<header class="order-map"><div id="map" role="region" aria-label="${escapeHtml(t.mapOfLocation)}"></div><span class="brand-mark chip"><span class="logo">${iconSvg('mapPin', 14)}</span>${escapeHtml(en.brand.name)}</span></header>`
    : topbar()
}
<main class="sheet" id="main">
  <div class="live-strip">
    <span class="live-dot" aria-hidden="true"></span>
    <p class="live-line" id="liveLine" aria-hidden="true">${escapeHtml(view.line)}</p>
    <span class="sr-only" id="liveSr" aria-live="polite">${escapeHtml(view.line)}</span>
    <span class="step-pill" id="stepPill">${escapeHtml(view.step)}</span>
  </div>
  <div class="sheet-card">
    <h1 id="title">${escapeHtml(view.title)}</h1>
    <p class="lead">${escapeHtml(t.headline(p.businessName))}</p>
    <div class="divider"></div>
    ${
      p.code
        ? `<div class="code-head"><span class="eyebrow">${escapeHtml(t.codeTitle)}</span></div>
    <div class="code-tiles" role="img" aria-label="${escapeHtml(t.codeTitle)}: ${escapeHtml(p.code.split('').join(' '))}">${p.code.split('').map(reel).join('')}</div>
    <div class="notice notice-brand">${iconSvg('lockKey', 20)}<span class="semibold">${escapeHtml(t.codeInstruction)}</span></div>`
        : `<div class="notice notice-warn">${iconSvg('warning', 20)}<span>${escapeHtml(t.codeUnavailable)}</span></div>`
    }
    <div class="route">
      <div class="stop">${iconSvg('storefront', 20)}<span class="label">${escapeHtml(t.from)}</span><span class="value">${escapeHtml(p.businessName)}</span></div>
      <div class="stop">${iconSvg('mapPin', 20)}<span class="label">${escapeHtml(t.to)}</span><span><span class="value">${p.postcode ? escapeHtml(p.postcode.replace(/-/g, ' ')) : escapeHtml(t.deliverTo)}</span>${p.landmark ? `<br><span class="sub">${escapeHtml(p.landmark)}</span>` : ''}</span></div>
    </div>
    <p class="live-note">${escapeHtml(t.liveNote)}</p>
  </div>
</main>
${hasMap ? `<script src="${LEAFLET_JS.src}" integrity="${LEAFLET_JS.integrity}" crossorigin="" nonce="${p.nonce}"></script>` : ''}
<script nonce="${p.nonce}">
(function () {
  var D = ${jsonForScript(clientData)};
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var base = location.pathname.replace(/\\/$/, '');

  // Map: the customer's own pin, for orientation (not interactive beyond pan and zoom).
  if (window.L && D.lat != null) {
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([D.lat, D.lng], 16);
    L.tileLayer(D.tileUrl, { maxZoom: 19, attribution: D.tileAttribution }).addTo(map);
    L.marker([D.lat, D.lng], { icon: L.divIcon({ html: D.pinSvg, className: '', iconSize: [44, 44], iconAnchor: [22, 42] }), keyboard: false }).addTo(map);
    map.panBy([0, 60], { animate: false }); // keep the pin above the sheet
  }

  // Code reveal: each reel rolls from 0 through a full cycle and lands on its digit, staggered.
  // Without JS (or with reduced motion) the reels simply sit on the digit.
  if (!reduce) {
    Array.prototype.forEach.call(document.querySelectorAll('.reel'), function (el, i) {
      el.style.transition = 'none';
      el.style.transform = 'translateY(0)';
      el.getBoundingClientRect(); // commit the start position
      el.style.transition = 'transform 1200ms cubic-bezier(0.23, 1, 0.32, 1) ' + (150 + i * 120) + 'ms';
      el.style.transform = '';
    });
  }

  // Live line: letters settle into the new text, left to right (~500 ms). Screen readers get the final text only.
  var CHARS = 'abcdefghijklmnopqrstuvwxyz';
  function scrambleTo(text) {
    var el = $('liveLine');
    $('liveSr').textContent = text;
    if (reduce) { el.textContent = text; return; }
    var start = performance.now(), dur = 500;
    function frame(now) {
      var p = Math.min(1, (now - start) / dur);
      var done = Math.floor(p * text.length);
      var out = text.slice(0, done);
      for (var i = done; i < text.length; i++) out += text[i] === ' ' ? ' ' : CHARS[(Math.random() * 26) | 0];
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame); else el.textContent = text;
    }
    requestAnimationFrame(frame);
  }
  scrambleTo($('liveLine').textContent);

  // Poll for progress every 15 s while the page is on screen.
  var current = D.status, timer = null;
  function poll() {
    fetch(base + '/status', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (r.status === 404) { location.reload(); return null; } return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s || s.status === current) return;
        current = s.status;
        if (s.status === 'delivered') { location.reload(); return; }
        scrambleTo(s.line);
        $('stepPill').textContent = s.step;
        var h = $('title');
        h.classList.add('swap');
        setTimeout(function () { h.textContent = s.title; h.classList.remove('swap'); }, 200);
      })
      .catch(function () {});
  }
  function start() { if (!timer) timer = setInterval(poll, 15000); }
  function stop() { clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { poll(); start(); } else stop(); });
  if (document.visibilityState === 'visible') start();
})();
</script>
</body>
</html>`;
}

export function renderDeliveredPage(nonce: string): string {
  const t = en.customer;
  return simplePage(nonce, t.deliveredTitle, statusBlock('checkCircle', 'brand', t.deliveredTitle, t.delivered));
}
