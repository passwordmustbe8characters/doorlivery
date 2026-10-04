import { en, type DeliveryStatus } from '@doorlivery/shared';

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
