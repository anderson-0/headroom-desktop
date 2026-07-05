import { describe, expect, it } from "vitest";

import type { TransformationFeedEvent } from "./types";
import { isThrashMarker, thrashRate } from "./thrashSignal";

function ev(transforms: string[]): TransformationFeedEvent {
  return { transformsApplied: transforms };
}

describe("isThrashMarker", () => {
  it("flags superseded re-reads", () => {
    expect(isThrashMarker("read_lifecycle:superseded")).toBe(true);
    expect(isThrashMarker("read_lifecycle:superseded:/src/App.tsx")).toBe(true);
    expect(isThrashMarker("reread_detected")).toBe(true);
  });

  it("excludes stale (legitimate file change, not thrash)", () => {
    expect(isThrashMarker("read_lifecycle:stale")).toBe(false);
    expect(isThrashMarker("read_lifecycle:stale:/src/App.tsx")).toBe(false);
  });

  it("ignores unrelated transforms", () => {
    expect(isThrashMarker("tool_crush:7")).toBe(false);
    expect(isThrashMarker("cache_align")).toBe(false);
  });
});

describe("thrashRate", () => {
  it("is the share of events with a thrash marker", () => {
    const events = [
      ev(["read_lifecycle:superseded:/a"]),
      ev(["cache_align"]),
      ev(["read_lifecycle:stale:/b"]), // legitimate change, not thrash
      ev(["reread"])
    ];
    expect(thrashRate(events)).toBeCloseTo(0.5); // 2 of 4
  });

  it("returns null with no events", () => {
    expect(thrashRate([])).toBeNull();
  });
});
