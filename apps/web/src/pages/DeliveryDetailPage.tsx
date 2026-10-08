import { useCallback, useEffect, useRef, useState } from 'react';
import { en, formatNigerianPhone, type DeliveryStatus, type IconName } from '@doorlivery/shared';
import { api, RequestError, type DeliveryDetail, type ShareLink } from '../api';
import { CardSkeleton, ConfirmDialog, displayPostcode, ErrorText, formatWhen, Icon, StatusBadge, Toast } from '../components';
import { describeNewEvent } from '../live-changes';
import { linkHandler } from '../router';
import { usePolling } from '../usePolling';

const t = en.vendor.detail;
const CAN_SEND_CUSTOMER: DeliveryStatus[] = ['created', 'awaiting_customer'];
const CAN_SEND_RIDER: DeliveryStatus[] = ['ready', 'assigned'];
const CLOSED: DeliveryStatus[] = ['delivered', 'failed', 'cancelled'];

/** How far along the 5-step progress bar a status is: [steps done, current step]. */
function progressOf(status: DeliveryStatus): [number, number] {
  switch (status) {
    case 'created': return [0, 0];
    case 'awaiting_customer': return [1, 1];
    case 'ready': return [2, 2];
    case 'assigned': return [3, 3];
    case 'picked_up':
    case 'arrived': return [4, 4];
    case 'delivered': return [5, -1];
    default: return [0, -1];
  }
}

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

function Fact({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    // <dt>/<dd> must be direct children of the row <div> for screen readers (axe: dlitem, definition-list).
    <div className="fact">
      <Icon name={icon} />
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function DeliveryDetailPage({ id, business }: { id: string; business: string }) {
  const [d, setD] = useState<DeliveryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ kind: 'customer' | 'rider'; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [riderPhone, setRiderPhone] = useState('');
  const [dialog, setDialog] = useState<'cancel' | 'unlock' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  // How many timeline events we've already shown; null until the first load.
  const seenEvents = useRef<number | null>(null);

  const load = useCallback(
    async (background = false) => {
      try {
        const detail = await api.get(id);
        // Tell the vendor about anything the customer, rider or system did since the last load.
        if (seenEvents.current !== null) {
          const notice = describeNewEvent(detail, detail.events, seenEvents.current, business);
          if (notice) setToast(notice);
        }
        seenEvents.current = detail.events.length;
        setD(detail);
        setRiderPhone((p) => p || detail.rider_phone || '');
      } catch (e) {
        // A failed background refresh stays quiet (flaky mobile data); the next one will try again.
        if (!background) setError(e instanceof RequestError ? e.message : en.vendor.errorGeneric);
      }
    },
    [id, business],
  );

  useEffect(() => {
    seenEvents.current = null;
    void load();
  }, [load]);

  // Live updates: refresh every 10 s while the page is on screen, but not while an action is running.
  usePolling(() => load(true), 10_000, !busy && !!d && !CLOSED.includes(d.status));

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

  const confirmDialog = async () => {
    const which = dialog;
    await run(() => (which === 'cancel' ? api.cancel(id) : api.unlockCode(id)));
    setDialog(null);
  };

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked: the link is visible and selectable anyway.
    }
  }

  const back = (
    <a className="back" href="/" onClick={linkHandler('/')}>
      <Icon name="arrowLeft" size={16} />
      {t.back}
    </a>
  );

  if (!d) {
    return (
      <>
        {back}
        <ErrorText message={error} />
        {!error && (
          <div className="stack-100" aria-busy="true">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}
      </>
    );
  }

  const [doneSteps, currentStep] = progressOf(d.status);
  const customerSent = d.events.some((e) => e.event_type === 'customer_link_sent');
  const closed = CLOSED.includes(d.status);
  const riderMoving = d.status === 'picked_up' || d.status === 'arrived';

  return (
    <>
      {back}

      <div className="detail-title">
        <div>
          <h1>{d.customer_name ?? en.vendor.list.nameRemoved}</h1>
          <p>{d.delivered_at ? t.deliveredOn(formatWhen(d.delivered_at)) : formatWhen(d.created_at)}</p>
        </div>
        <StatusBadge status={d.status} />
      </div>

      <ol className={`progress${d.status === 'cancelled' || d.status === 'failed' ? ' stopped' : ''}`} aria-label={t.progress}>
        {t.steps.map((label, i) => (
          <li key={label} className={i < doneSteps ? 'done' : i === currentStep ? 'current' : undefined} aria-current={i === currentStep ? 'step' : undefined}>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="section">
          <ErrorText message={error} />
        </div>
      )}

      {d.code_locked && !closed && (
        <section className="card section notice-danger appear" role="alert">
          <div className="section-title">
            <Icon name="lockKey" />
            <h2 className="text-base">{t.codeLockedTitle}</h2>
          </div>
          <p className="text-sm">{t.codeLocked}</p>
          <button type="button" className="btn btn-danger btn-block section" disabled={busy} onClick={() => setDialog('unlock')}>
            <Icon name="lockKeyOpen" />
            {t.unlockCode}
          </button>
        </section>
      )}

      {/* Next step: only the action that makes sense right now */}
      {CAN_SEND_CUSTOMER.includes(d.status) && (
        <section className="card section next-step">
          <div className="eyebrow">{t.nextStep}</div>
          <p className="lead">{t.sendToCustomerHint}</p>
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={sendToCustomer}>
            <Icon name="whatsappLogo" />
            {customerSent ? t.sendToCustomerAgain : t.sendToCustomer}
          </button>
        </section>
      )}

      {CAN_SEND_RIDER.includes(d.status) && (
        <section className="card section next-step">
          <div className="eyebrow">{t.nextStep}</div>
          <div className="field">
            <label className="field-label" htmlFor="rider-phone">
              {t.riderPhone}
            </label>
            <input
              id="rider-phone"
              className="input"
              type="tel"
              inputMode="tel"
              placeholder={en.vendor.form.phoneHint}
              value={riderPhone}
              onChange={(e) => setRiderPhone(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={busy || !riderPhone.trim()} onClick={sendToRider}>
            <Icon name="whatsappLogo" />
            {t.sendToRider}
          </button>
        </section>
      )}

      {d.status === 'awaiting_customer' && (
        <div className="notice notice-info section">
          <Icon name="clock" />
          <span>{t.sendToRiderHint}</span>
        </div>
      )}

      {riderMoving && (
        <div className="notice notice-info section">
          <Icon name="moped" />
          <span>{en.vendor.status[d.status]}</span>
        </div>
      )}

      {lastLink && (
        <div className="link-box appear">
          <code title={lastLink.link}>{lastLink.link}</code>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(lastLink.link)}>
            <Icon name={copied ? 'check' : 'copy'} size={16} />
            {copied ? t.copied : t.copyLink}
          </button>
        </div>
      )}

      <section className="card section">
        <dl className="facts">
          <Fact icon="user" label={t.customer}>
            {d.customer_name ?? <span className="subtle">{en.vendor.list.nameRemoved}</span>}
            {d.customer_phone && <span className="sub"> · {formatNigerianPhone(d.customer_phone)}</span>}
          </Fact>
          <Fact icon="mapPin" label={t.dropoff}>
            {d.dropoff_postcode ? <span className="postcode">{displayPostcode(d.dropoff_postcode)}</span> : <span className="subtle">{en.vendor.list.noPostcode}</span>}
          </Fact>
          {d.landmark_note && (
            <Fact icon="note" label={t.landmark}>
              {d.landmark_note}
            </Fact>
          )}
          <Fact icon="storefront" label={t.pickup}>
            {d.pickup_note}
          </Fact>
          {d.item_note && (
            <Fact icon="package" label={t.item}>
              {d.item_note}
            </Fact>
          )}
          <Fact icon="moped" label={t.rider}>
            {d.rider_phone ? formatNigerianPhone(d.rider_phone) : <span className="subtle">{t.noRider}</span>}
          </Fact>
        </dl>
      </section>

      <section className="card section">
        <h2 className="text-base section-title">{t.timeline}</h2>
        <ol className="timeline">
          {d.events.map((e, i) => (
            <li key={i} className={e.actor !== 'vendor' ? 'outside' : undefined}>
              <span>{en.vendor.events[e.event_type] ?? e.event_type}</span>
              <span className="when">{formatWhen(e.occurred_at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {!closed && (
        <div className="danger-zone">
          <button type="button" className="btn btn-danger-ghost" disabled={busy} onClick={() => setDialog('cancel')}>
            {t.cancelDelivery}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={dialog !== null}
        danger={dialog === 'cancel'}
        busy={busy}
        title={dialog === 'unlock' ? t.unlockConfirmTitle : t.cancelConfirmTitle}
        body={dialog === 'unlock' ? t.unlockConfirm : t.cancelConfirm}
        confirmLabel={dialog === 'unlock' ? t.unlockCode : t.cancelDelivery}
        keepLabel={dialog === 'unlock' ? t.keepLocked : t.keepDelivery}
        onConfirm={() => void confirmDialog()}
        onClose={() => setDialog(null)}
      />
      <Toast message={toast} onClose={closeToast} />
    </>
  );
}
