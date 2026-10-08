// Pure helpers for live updates: what the vendor should be told after a background refresh.
import { en, type LiveParams } from '@doorlivery/shared';
import type { Delivery, DeliveryEvent } from './api';

const L = en.vendor.live;
const params = (d: Pick<Delivery, 'customer_name' | 'item_note'>, business: string): LiveParams => ({
  customer: d.customer_name ?? L.unknownCustomer,
  item: d.item_note,
  business,
});

// A status change in the list maps to the event that caused it. Statuses the vendor causes
// (link sent, rider assigned, cancelled) are left out: you never get told about your own taps.
const STATUS_EVENT: Partial<Record<Delivery['status'], string>> = {
  ready: 'customer_confirmed',
  picked_up: 'picked_up',
  arrived: 'arrived',
  delivered: 'delivered',
};

/** List page: the first delivery that changed because of someone else, as a sentence. */
export function describeListChange(before: Delivery[], after: Delivery[], business: string): string | null {
  const prev = new Map(before.map((d) => [d.id, d]));
  for (const d of after) {
    const p = prev.get(d.id);
    if (!p) continue; // new rows come from the vendor's own "New delivery"
    if (d.code_locked && !p.code_locked) return L.event.code_locked!(params(d, business));
    const ev = d.status !== p.status ? STATUS_EVENT[d.status] : undefined;
    if (ev) return L.event[ev]!(params(d, business));
  }
  return null;
}

/** Detail page: the newest event since `seen` that the vendor didn't cause, as a sentence. */
export function describeNewEvent(
  d: Pick<Delivery, 'customer_name' | 'item_note'>,
  events: DeliveryEvent[],
  seen: number,
  business: string,
): string | null {
  const fresh = events.slice(seen).filter((e) => e.actor !== 'vendor');
  const latest = fresh[fresh.length - 1];
  if (!latest) return null;
  const sentence = L.event[latest.event_type];
  return sentence ? sentence(params(d, business)) : L.update(params(d, business).customer, en.vendor.events[latest.event_type] ?? latest.event_type);
}
