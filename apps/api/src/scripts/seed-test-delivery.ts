// Dev only: creates a test vendor + delivery and prints the customer link (slice 2).
// Run: npm run db:seed
import { config } from '../config.js';
import { db, pool } from '../db/client.js';
import { deliveries, vendors } from '../db/schema.js';
import { generateToken, hashToken } from '../lib/tokens.js';

if (config.NODE_ENV === 'production') {
  console.error('Refusing to seed test data in production.');
  process.exit(1);
}
if (!db || !pool) {
  console.error('DATABASE_URL is empty. Add it to .env first.');
  process.exit(1);
}

const TEST_VENDOR_EMAIL = 'test-vendor@doorlivery.local';

const [vendor] = await db
  .insert(vendors)
  .values({
    email: TEST_VENDOR_EMAIL,
    // Not a valid hash, so this account can never log in. Real auth arrives in slice 3.
    password_hash: '!seed-no-login',
    business_name: 'Test Vendor Ltd',
  })
  .onConflictDoUpdate({ target: vendors.email, set: { updated_at: new Date() } })
  .returning({ id: vendors.id });

const token = generateToken();
const [delivery] = await db
  .insert(deliveries)
  .values({
    vendor_id: vendor!.id,
    pickup_note: 'Test pickup: shop front',
    customer_name: 'Test Customer',
    item_note: 'Test parcel',
    status: 'awaiting_customer',
    customer_token_hash: hashToken(token),
  })
  .returning({ id: deliveries.id });

console.log(`Test delivery ${delivery!.id} created.`);
console.log(`Customer link: ${config.PUBLIC_BASE_URL}/c/${token}`);
await pool.end();
