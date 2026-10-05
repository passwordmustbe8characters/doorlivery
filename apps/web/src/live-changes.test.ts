import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Delivery, DeliveryEvent } from './api';
import { describeListChange, describeNewEvent } from './live-changes';

const row = (over: Partial<Delivery>): Delivery => ({
  id: 'a',
  status: 'awaiting_customer',
  customer_name: 'Chidi',
  customer_phone: null,
  pickup_note: 'x',
  item_note: null,
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
  it('customer confirmed -> "Chidi: Ready"', () => {
    assert.equal(describeListChange([row({})], [row({ status: 'ready' })]), 'Chidi: Ready');
  });
  it('code locked takes priority', () => {
    assert.equal(describeListChange([row({ status: 'arrived' })], [row({ status: 'arrived', code_locked: true })]), 'Chidi: Code locked');
  });
  it('nothing changed -> no notice', () => {
    assert.equal(describeListChange([row({})], [row({})]), null);
  });
  it('a brand-new row (vendor created it) -> no notice', () => {
    assert.equal(describeListChange([row({})], [row({}), row({ id: 'b' })]), null);
  });
  it('name removed by retention -> generic label', () => {
    assert.equal(describeListChange([row({ customer_name: null })], [row({ customer_name: null, status: 'ready' })]), 'A delivery: Ready');
  });
});

describe('detail live updates', () => {
  const base = [ev('created', 'vendor'), ev('customer_link_sent', 'vendor')];
  it('customer confirmed while the page was open', () => {
    assert.equal(describeNewEvent('Chidi', [...base, ev('customer_confirmed', 'customer')], 2), 'Chidi: Customer confirmed location');
  });
  it("the vendor's own action -> no notice", () => {
    assert.equal(describeNewEvent('Chidi', [...base, ev('assigned', 'vendor')], 2), null);
  });
  it('several rider steps at once -> the newest', () => {
    assert.equal(describeNewEvent('Chidi', [...base, ev('picked_up', 'rider'), ev('arrived', 'rider')], 2), 'Chidi: Rider arrived');
  });
  it('code locked by the system', () => {
    assert.equal(describeNewEvent('Chidi', [...base, ev('code_locked', 'system')], 2), 'Chidi: Code locked after 5 wrong tries');
  });
  it('nothing new', () => {
    assert.equal(describeNewEvent('Chidi', base, 2), null);
  });
});
