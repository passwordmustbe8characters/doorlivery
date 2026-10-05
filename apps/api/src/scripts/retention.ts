// Run the retention job once by hand.
//   npm run retention              apply
//   npm run retention -- --dry-run show what would change
import { pool } from '../db/client.js';
import { runRetention } from '../jobs/retention.js';
import { config } from '../config.js';

const dryRun = process.argv.includes('--dry-run');
try {
  const r = await runRetention({ dryRun });
  console.log(
    `${dryRun ? 'Would' : 'Did'}: redact ${r.redacted} deliveries closed > ${config.RETENTION_DAYS} days, ` +
      `clear links on ${r.tokensCleared} closed > ${config.TOKEN_TTL_AFTER_CLOSE_DAYS} days, delete ${r.sessionsDeleted} expired sessions.`,
  );
} catch (err) {
  console.error('Retention failed:', err instanceof Error ? err.message : 'unknown');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
