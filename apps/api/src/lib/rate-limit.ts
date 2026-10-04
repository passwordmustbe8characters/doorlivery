// In-memory fixed-window counter. Fine for one API instance; move to Postgres/Redis if we scale out.

export class FixedWindowLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when the key has used up its allowance in the current window. */
  isBlocked(key: string): boolean {
    const entry = this.hits.get(key);
    return !!entry && entry.resetAt > this.now() && entry.count >= this.limit;
  }

  hit(key: string): void {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
