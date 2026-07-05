import { describe, expect, it } from "vitest";

import { cacheHitRate, isCacheUnhealthy } from "./cacheStats";

describe("cacheHitRate", () => {
  it("computes read / (read + write + uncached)", () => {
    expect(
      cacheHitRate({ cacheReadTokens: 90, cacheWriteTokens: 5, uncachedInputTokens: 5 })
    ).toBeCloseTo(0.9);
  });

  it("returns null when there is no input", () => {
    expect(
      cacheHitRate({ cacheReadTokens: 0, cacheWriteTokens: 0, uncachedInputTokens: 0 })
    ).toBeNull();
  });
});

describe("isCacheUnhealthy", () => {
  it("is healthy when reads dominate writes", () => {
    expect(
      isCacheUnhealthy({ cacheReadTokens: 9000, cacheWriteTokens: 100, uncachedInputTokens: 0 })
    ).toBe(false);
  });

  it("is unhealthy when write premium outweighs read savings", () => {
    // write*0.25 = 2500 > read*0.9 = 900
    expect(
      isCacheUnhealthy({ cacheReadTokens: 1000, cacheWriteTokens: 10000, uncachedInputTokens: 0 })
    ).toBe(true);
  });
});
