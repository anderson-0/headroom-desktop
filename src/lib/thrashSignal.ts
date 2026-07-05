import type { TransformationFeedEvent } from "./types";

// Thrash = the agent re-reading previously-seen, unchanged content (the proxy emits
// `read_lifecycle:superseded`, enriched form `read_lifecycle:superseded:<path>`, or
// any `reread` marker). `read_lifecycle:stale` is EXCLUDED — that's a legitimate file
// change, not thrash (the FR-AT counter-metric false-positive).
export function isThrashMarker(transform: string): boolean {
  const t = transform.toLowerCase();
  if (t.startsWith("read_lifecycle:stale")) return false;
  return t.startsWith("read_lifecycle:superseded") || t.includes("reread");
}

export function isThrashEvent(event: TransformationFeedEvent): boolean {
  return (event.transformsApplied ?? []).some(isThrashMarker);
}

export function thrashEvents(events: TransformationFeedEvent[]): TransformationFeedEvent[] {
  return events.filter(isThrashEvent);
}

// Share of feed events that re-read previously-seen content. null when no events.
export function thrashRate(events: TransformationFeedEvent[]): number | null {
  if (events.length === 0) return null;
  return thrashEvents(events).length / events.length;
}
