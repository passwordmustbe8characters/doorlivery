import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { en, ICON_PATHS, type DeliveryStatus, type IconName } from '@doorlivery/shared';

/** Phosphor icon (path data in @doorlivery/shared). Decorative unless given a label. */
export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark">
      <span className="logo">
        <Icon name="mapPin" size={18} />
      </span>
      {en.brand.name}
    </span>
  );
}

const STATUS_TONE: Record<DeliveryStatus, string> = {
  created: '',
  awaiting_customer: 'badge-warn',
  ready: 'badge-info',
  assigned: 'badge-info',
  picked_up: 'badge-info',
  arrived: 'badge-info',
  delivered: 'badge-brand',
  failed: 'badge-danger',
  cancelled: 'badge-danger',
};

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{en.vendor.status[status] ?? status}</span>;
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <div className="notice notice-danger appear" role="alert">
      <Icon name="warning" />
      <span>{message}</span>
    </div>
  ) : null;
}

/**
 * Live-update notice that drops in at the top of the screen and leaves the same way.
 * Announced to screen readers; hides itself after 8 s or when dismissed.
 */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      onClose();
    }, 200); // matches .toast.leaving transition
  }, [onClose]);

  useEffect(() => {
    if (!message) return;
    setLeaving(false);
    const t = setTimeout(dismiss, 8000);
    return () => clearTimeout(t);
  }, [message, dismiss]);

  // Portal to <body>: an ancestor with a transform (the page fade-in) would otherwise trap position: fixed.
  return createPortal(
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className={`toast${leaving ? ' leaving' : ''}`} key={message}>
          <Icon name="checkCircle" />
          <span>{message}</span>
          <button type="button" className="btn btn-icon" onClick={dismiss} aria-label={en.vendor.live.dismiss}>
            <Icon name="x" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * Confirmation built on the native <dialog>: focus is trapped, Esc closes it, and the page behind is inert.
 * Buttons name the action ("Cancel delivery" / "Keep delivery"), never OK / Cancel.
 */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  keepLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog ref={ref} className="sheet" onClose={props.onClose} aria-labelledby="dialog-title">
      <h2 id="dialog-title">{props.title}</h2>
      <p>{props.body}</p>
      <div className="actions">
        <button type="button" className={`btn btn-block ${props.danger ? 'btn-danger' : 'btn-primary'}`} disabled={props.busy} onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
        <button type="button" className="btn btn-block btn-secondary" autoFocus onClick={props.onClose}>
          {props.keepLabel}
        </button>
      </div>
    </dialog>
  );
}

/** Loading placeholder shaped like a delivery card. */
export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="item-top">
        <div className="skeleton sk-line mid" />
        <div className="skeleton sk-pill" />
      </div>
      <div className="item-meta">
        <div className="skeleton sk-line short" />
      </div>
    </div>
  );
}

/** "LA-12-B04-EK-01" -> "LA 12 B04 EK 01" (NIPOST display form). */
export function displayPostcode(code: string): string {
  return code.replace(/-/g, ' ');
}

export function formatWhen(iso: string): string {
  // 12-hour clock ("8 Oct, 12:58 am"): how times are usually written in Nigeria.
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}
