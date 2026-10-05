// Pure helpers for live updates: what the vendor should be told after a background refresh.
import { en } from '@doorlivery/shared';
import type { Delivery, DeliveryEvent } from './api';

const who = (name: string | null) => name ?? en.vendor.live.unknownCustomer;

/** List page: the first delivery whose status changed or whose code just locked, as a notice. */
export function describeListChange(before: Delivery[], after: Delivery[]): string | null {
  const prev = new Map(before.map((d) => [d.id, d]));
  for (const d of after) {
    const p = prev.get(d.id);
    if (!p) continue; // new rows come from the vendor's own "New delivery"
    if (d.code_locked && !p.code_locked) return en.vendor.live.update(who(d.customer_name), en.vendor.list.codeLocked);
    if (d.status !== p.status) return en.vendor.live.update(who(d.customer_name), en.vendor.status[d.status] ?? d.status);
  }
  return null;
}

/** Detail page: the newest event since `seen` that the vendor didn't cause, as a notice. */
export function describeNewEvent(customerName: string | null, events: DeliveryEvent[], seen: number): string | null {
  const fresh = events.slice(seen).filter((e) => e.actor !== 'vendor');
  const latest = fresh[fresh.length - 1];
  return latest ? en.vendor.live.update(who(customerName), en.vendor.events[latest.event_type] ?? latest.event_type) : null;
}
