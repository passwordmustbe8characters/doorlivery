import { useEffect } from 'react';
import { en, type DeliveryStatus } from '@doorlivery/shared';

/** Live-update notice pinned to the bottom of the screen. Announced to screen readers; hides after 8 s. */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className="toast">
          <span>{message}</span>
          <button type="button" className="link" onClick={onClose} aria-label={en.vendor.live.dismiss}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <span className={`badge badge-${status}`}>{en.vendor.status[status] ?? status}</span>;
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

/** "LA-12-B04-EK-01" -> "LA 12 B04 EK 01" (NIPOST display form). */
export function displayPostcode(code: string): string {
  return code.replace(/-/g, ' ');
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
