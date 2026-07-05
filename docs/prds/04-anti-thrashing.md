---
title: PRD — Anti-Thrashing Telemetry (desktop)
status: draft
created: 2026-06-29
updated: 2026-06-29
---

# PRD: Anti-Thrashing Telemetry

> Scope: desktop telemetry + alerting (plus optional intercept-side detection). See
> [overview](00-token-reduction-overview.md).

## 0. Document Purpose
Define the desktop surface that detects and surfaces **compaction thrashing** — when
compaction drops content the agent then re-fetches (re-reads a file, re-runs a
tool), spending *more* tokens. Inputs: token-reduction survey §6.

## 1. Vision
Thrashing is the single most damaging compaction failure: it looks like savings but
silently inflates cost and degrades the agent loop. The desktop makes it
**measurable** — a re-read/re-fetch rate the user can watch and use to back off
over-aggressive pruning. This is the safety net for PRDs 03 and 05.

## 2. Target User
Single desktop operator tuning compaction/pruning who needs to know when they've
gone too far.

### 2.1 Jobs To Be Done
- See whether compacted content is being re-fetched by the agent.
- Get alerted when the thrash rate crosses a threshold.
- Trace a thrash event back to what was compacted (so they can exclude it).

### 2.3 Key User Journey
**UJ-1 — "Savings that aren't."** Operator pushes pruning aggressive. A banner in
Token Reduction warns *"thrash rate 18% (↑ from 4%) — compacted content is being
re-read."* They open the thrash list, see the same large tool_result compacted then
re-fetched 3x, and exclude that content type from pruning. Thrash rate falls back.

## 3. Glossary
- **Thrash event:** an agent re-fetch (re-read file, re-run tool, re-request) of
  content that a prior compaction dropped or marked (CCR).
- **Thrash rate:** thrash events / compaction events over a window.
- **Re-read detection:** matching a current request's fetched content against
  previously-compacted content (by hash / CCR marker / path).

## 4. Features

### 4.1 Thrash detection signal
**Description:** Determine when compacted content gets re-fetched. Detection can be
intercept-side (Rust, on 6767, which already sees full request bodies) or proxy-fed.
`[ASSUMPTION]` the intercept can hash compacted/CCR'd content and flag a later
request that re-fetches the same path/hash.

- **FR-AT-1:** The system must identify thrash events by correlating a request's
  fetched content with previously compacted/CCR'd content (path, content hash, or
  CCR marker id).
- **FR-AT-2:** Thrash detection must run off the request hot path (NFR-G1) — it
  observes, never blocks forwarding.

### 4.2 Thrash telemetry & alerting
**Description:** Persisted history + threshold alerts.

- **FR-AT-3:** The view must show the **thrash rate** over a selectable window and
  its trend (so a sudden rise after a config change is obvious).
- **FR-AT-4:** The view must list recent thrash events: what content, when first
  compacted, when re-fetched, estimated wasted tokens.
- **FR-AT-5:** The view must let the user set a thrash-rate alert threshold and
  raise a non-blocking banner/notification when crossed (reuse existing notification
  plumbing).
- **FR-AT-6:** Thrash telemetry must be filterable by project (workspace) and
  cross-linked from the pruning PRD's counter-metric (FR-QP-8).
- **FR-AT-7:** Each thrash event must link to the originating compaction's
  per-message diff (reuse compaction history view) so the user sees exactly what was
  dropped.

## 5. Success Metrics
- Thrash rate is observable and actionable (primary — existence of the metric is the
  win; lower is better).
- Wasted tokens from re-fetches, trended.
- **Counter-metric:** detection false-positive rate — flagging legitimate re-reads
  (e.g. a file genuinely changed) as thrash. Must stay low or the alert is noise.

## 8. Open Questions
- **[PHASE-BLOCKER]** Where does detection live — intercept (Rust) or proxy? Intercept
  has full bodies but must distinguish "re-read of compacted content" from "re-read
  of changed content" (the read-lifecycle logic already exists proxy-side).
- How to attribute "wasted tokens" to a thrash event credibly vs estimate?
- Does a genuine file change (different content, same path) count as thrash? Default
  no — needs content-hash compare, not just path.

## 9. Assumptions Index
- `[ASSUMPTION]` Compacted content carries a stable identifier (CCR marker id or
  content hash) that a later request can be matched against.
- `[ASSUMPTION]` The intercept proxy already parses request bodies enough to extract
  fetched paths/tool results (it does for the transformations feed).
