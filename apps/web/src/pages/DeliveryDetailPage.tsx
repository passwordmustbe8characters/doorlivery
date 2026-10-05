import { useCallback, useEffect, useState } from 'react';
import { en, formatNigerianPhone, type DeliveryStatus } from '@doorlivery/shared';
import { api, RequestError, type DeliveryDetail, type ShareLink } from '../api';
import { displayPostcode, ErrorText, formatWhen, StatusBadge } from '../components';
import { linkHandler } from '../router';

const t = en.vendor.detail;
const CAN_SEND_CUSTOMER: DeliveryStatus[] = ['created', 'awaiting_customer'];
const CAN_SEND_RIDER: DeliveryStatus[] = ['ready', 'assigned'];
const CLOSED: DeliveryStatus[] = ['delivered', 'failed', 'cancelled'];

/**
 * Opens WhatsApp with the prefilled message. The tab is opened before the API call (synchronously in the
 * click) so mobile browsers don't treat it as a pop-up, then pointed at wa.me once we have the link.
 */
async function shareViaWhatsApp(getLink: () => Promise<ShareLink>): Promise<ShareLink> {
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  try {
    const share = await getLink();
    if (win) win.location.href = share.whatsapp_url;
    else location.href = share.whatsapp_url;
    return share;
  } catch (err) {
    win?.close();
    throw err;
  }
}

export function DeliveryDetailPage({ id }: { id: string }) {
  const [d, setD] = useState<DeliveryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ kind: 'customer' | 'rider'; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [riderPhone, setRiderPhone] = useState('');

  const load = useCallback(async () => {
    try {
      const detail = await api.get(id);
      setD(detail);
      setRiderPhone((p) => p || detail.rider_phone || '');
    } catch (e) {
      setError(e instanceof RequestError ? e.message : en.vendor.errorGeneric);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : en.vendor.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  const sendToCustomer = () =>
    run(async () => {
      const s = await shareViaWhatsApp(() => api.customerLink(id));
      setLastLink({ kind: 'customer', link: s.link });
      setCopied(false);
    });

  const sendToRider = () =>
    run(async () => {
      const s = await shareViaWhatsApp(() => api.assign(id, riderPhone.trim() || undefined));
      setLastLink({ kind: 'rider', link: s.link });
      setCopied(false);
    });

  const cancel = () => {
    if (window.confirm(t.cancelConfirm)) void run(() => api.cancel(id));
  };

  const unlock = () => {
    if (window.confirm(t.unlockConfirm)) void run(() => api.unlockCode(id));
  };

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked: the link is visible and selectable anyway.
    }
  }

  if (!d) {
    return (
      <>
        <a href="/" onClick={linkHandler('/')}>
          ← {t.back}
        </a>
        <ErrorText message={error} />
      </>
    );
  }

  const customerSent = d.events.some((e) => e.event_type === 'customer_link_sent');

  return (
    <>
      <a href="/" onClick={linkHandler('/')}>
        ← {t.back}
      </a>
      <div className="row between">
        <h1>{d.customer_name}</h1>
        <StatusBadge status={d.status} />
      </div>

      <dl className="card facts">
        <dt>{t.customer}</dt>
        <dd>
          {d.customer_name}
          {d.customer_phone && <span className="muted"> · {formatNigerianPhone(d.customer_phone)}</span>}
        </dd>
        <dt>{t.pickup}</dt>
        <dd>{d.pickup_note}</dd>
        {d.item_note && (
          <>
            <dt>{t.item}</dt>
            <dd>{d.item_note}</dd>
          </>
        )}
        <dt>{t.dropoff}</dt>
        <dd>{d.dropoff_postcode ? displayPostcode(d.dropoff_postcode) : '—'}</dd>
        {d.landmark_note && (
          <>
            <dt>{t.landmark}</dt>
            <dd>{d.landmark_note}</dd>
          </>
        )}
        <dt>{t.rider}</dt>
        <dd>{d.rider_phone ? formatNigerianPhone(d.rider_phone) : <span className="muted">{t.noRider}</span>}</dd>
      </dl>

      <ErrorText message={error} />

      {d.code_locked && !CLOSED.includes(d.status) && (
        <section className="card stack alert" role="alert">
          <p>{t.codeLocked}</p>
          <button type="button" className="primary" disabled={busy} onClick={unlock}>
            {t.unlockCode}
          </button>
        </section>
      )}

      {CAN_SEND_CUSTOMER.includes(d.status) && (
        <section className="card stack">
          <button type="button" className="primary whatsapp" disabled={busy} onClick={sendToCustomer}>
            {customerSent ? t.sendToCustomerAgain : t.sendToCustomer}
          </button>
          <p className="hint">{t.sendToCustomerHint}</p>
        </section>
      )}

      {!CLOSED.includes(d.status) && (
        <section className="card stack">
          <label>
            {t.riderPhone}
            <input
              type="tel"
              inputMode="tel"
              placeholder={en.vendor.form.phoneHint}
              value={riderPhone}
              onChange={(e) => setRiderPhone(e.target.value)}
              disabled={!CAN_SEND_RIDER.includes(d.status)}
            />
          </label>
          <button
            type="button"
            className="primary whatsapp"
            disabled={busy || !CAN_SEND_RIDER.includes(d.status) || !riderPhone.trim()}
            onClick={sendToRider}
          >
            {t.sendToRider}
          </button>
          {!CAN_SEND_RIDER.includes(d.status) && <p className="hint">{t.sendToRiderHint}</p>}
        </section>
      )}

      {lastLink && (
        <section className="card stack">
          <span className="muted small">{t.linkLabel}</span>
          <code className="link-box">{lastLink.link}</code>
          <button type="button" className="secondary" onClick={() => copy(lastLink.link)}>
            {copied ? t.copied : t.copyLink}
          </button>
        </section>
      )}

      <section className="card">
        <h2>{t.timeline}</h2>
        <ol className="timeline">
          {d.events.map((e, i) => (
            <li key={i}>
              <span>{en.vendor.events[e.event_type] ?? e.event_type}</span>
              <span className="muted small">{formatWhen(e.occurred_at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {!CLOSED.includes(d.status) && (
        <button type="button" className="danger-link" disabled={busy} onClick={cancel}>
          {t.cancelDelivery}
        </button>
      )}
    </>
  );
}
