// Customer and rider links stop working a fixed time after the delivery closes (SPEC 6).
// Cancel clears the token hashes at once; delivered links stay readable for TTL days, then die.
import { config } from '../config.js';

const DAY_MS = 86_400_000;

export function isLinkExpired(closedAt: Date | null, now = new Date(), ttlDays = config.TOKEN_TTL_AFTER_CLOSE_DAYS): boolean {
  return closedAt !== null && now.getTime() - closedAt.getTime() > ttlDays * DAY_MS;
}
