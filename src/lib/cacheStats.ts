import type { CacheStats } from "./types";

// Cache-read hit rate: share of input tokens served from the provider prefix cache.
// read / (read + write + uncached). Returns null when there's no input at all.
export function cacheHitRate(s: CacheStats): number | null {
  const total = s.cacheReadTokens + s.cacheWriteTokens + s.uncachedInputTokens;
  if (total <= 0) return null;
  return s.cacheReadTokens / total;
}

// "Cache health" flag (FR-CB-8): warns when cache-write premium outweighs read
// savings, i.e. caching is enabled but rarely hit so it's a net loss.
// ponytail: rough heuristic using public Anthropic multipliers (write +25% premium,
// read 90% discount). Replace with proxy-reported $ if it ever exposes them.
const WRITE_PREMIUM = 0.25;
const READ_DISCOUNT = 0.9;

export function isCacheUnhealthy(s: CacheStats): boolean {
  const writeCost = s.cacheWriteTokens * WRITE_PREMIUM;
  const readSavings = s.cacheReadTokens * READ_DISCOUNT;
  return writeCost > readSavings;
}
