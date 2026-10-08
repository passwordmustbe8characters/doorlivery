import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Delivery, DeliveryEvent } from './api';
import { describeListChange, describeNewEvent } from './live-changes';

const SHOP = 'Adaeze Fabrics';
const row = (over: Partial<Delivery>): Delivery => ({
  id: 'a',
  status: 'awaiting_customer',
  customer_name: 'Chidi',
  customer_phone: null,
  pickup_note: 'x',
  item_note: '2 ankara dresses',
  rider_phone: null,
  dropoff_postcode: null,
  dropoff_confidence: null,
  landmark_note: null,
  code_locked: false,
  delivered_at: null,
  created_at: '2026-10-05T10:00:00Z',
  updated_at: '2026-10-05T10:00:00Z',
  ...over,
});
const ev = (event_type: string, actor: string): DeliveryEvent => ({ event_type, actor, occurred_at: '2026-10-05T10:00:00Z' });

describe('list live updates', () => {
  it('customer confirmed', () => {
    assert.equal(describeListChange([row({})], [row({ status: 'ready' })], SHOP), 'Chidi confirmed their delivery location');
  });
  it('delivered: "x has received their order of y from z"', () => {
    assert.equal(
      describeListChange([row({ status: 'arrived' })], [row({ status: 'delivered' })], SHOP),
      'Chidi has received their order of 2 ankara dresses from Adaeze Fabrics',
    );
  });
  it('delivered without an item note', () => {
    assert.equal(describeListChange([row({ status: 'arrived', item_note: null })], [row({ status: 'delivered', item_note: null })], SHOP), 'Chidi has received their order from Adaeze Fabrics');
  });
  it('rider picked up names the item', () => {
    assert.equal(describeListChange([row({ status: 'assigned' })], [row({ status: 'picked_up' })], SHOP), "The rider picked up Chidi's 2 ankara dresses");
  });
  it('code locked takes priority', () => {
    assert.match(describeListChange([row({ status: 'arrived' })], [row({ status: 'arrived', code_locked: true })], SHOP)!, /^Delivery code locked on Chidi's order/);
  });
  it("the vendor's own changes (assigned, cancelled) -> no notice", () => {
    assert.equal(describeListChange([row({ status: 'ready' })], [row({ status: 'assigned' })], SHOP), null);
    assert.equal(describeListChange([row({})], [row({ status: 'cancelled' })], SHOP), null);
  });
  it('nothing changed / brand-new row -> no notice', () => {
    assert.equal(describeListChange([row({})], [row({})], SHOP), null);
    assert.equal(describeListChange([row({})], [row({}), row({ id: 'b' })], SHOP), null);
  });
  it('name removed by retention -> generic subject', () => {
    assert.equal(describeListChange([row({ customer_name: null })], [row({ customer_name: null, status: 'ready' })], SHOP), 'A customer confirmed their delivery location');
  });
});

describe('detail live updates', () => {
  const base = [ev('created', 'vendor'), ev('customer_link_sent', 'vendor')];
  const d = { customer_name: 'Chidi', item_note: '2 ankara dresses' };
  it('customer confirmed while the page was open', () => {
    assert.equal(describeNewEvent(d, [...base, ev('customer_confirmed', 'customer')], 2, SHOP), 'Chidi confirmed their delivery location');
  });
  it("the vendor's own action -> no notice", () => {
    assert.equal(describeNewEvent(d, [...base, ev('assigned', 'vendor')], 2, SHOP), null);
  });
  it('several rider steps at once -> the newest', () => {
    assert.equal(describeNewEvent(d, [...base, ev('picked_up', 'rider'), ev('arrived', 'rider')], 2, SHOP), "The rider has arrived at Chidi's location");
  });
  it('delivered by the rider', () => {
    assert.equal(describeNewEvent(d, [...base, ev('delivered', 'rider')], 2, SHOP), 'Chidi has received their order of 2 ankara dresses from Adaeze Fabrics');
  });
  it('nothing new', () => {
    assert.equal(describeNewEvent(d, base, 2, SHOP), null);
  });
});
