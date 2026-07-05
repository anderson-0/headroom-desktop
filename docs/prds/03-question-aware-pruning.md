---
title: PRD — Question-Aware Pruning (desktop)
status: draft
created: 2026-06-29
updated: 2026-06-29
---

# PRD: Question-Aware Pruning

> Scope: desktop config + telemetry only. Pruning engine lives in the proxy. See
> [overview](00-token-reduction-overview.md).

## 0. Document Purpose
Define the desktop surface to enable/tune query-conditioned pruning (LongLLMLingua-
style: prune context by relevance to the latest user query) and observe its impact.
Inputs: token-reduction survey §3.1.

## 1. Vision
Headroom already does type-aware, lossless-first compression. Question-aware
pruning deepens it: score context relevance against the current query and prune the
least-relevant tokens (extractive, not abstractive — extractive *improves* accuracy
by filtering noise; abstractive hurts it). The desktop lets the user turn this on,
bound how aggressive it is, and watch that quality holds.

## 2. Target User
Single desktop operator who wants deeper input compression but is (rightly) worried
about losing question-relevant context.

### 2.1 Jobs To Be Done
- Enable question-aware pruning and cap its aggressiveness (compression ratio).
- Keep it extractive-only (no risky abstractive summarization).
- Confirm pruning isn't dropping things the agent then has to re-fetch.

### 2.3 Key User Journey
**UJ-1 — "Compress more, but safely."** Operator enables question-aware pruning at
a conservative 2–3x cap. Telemetry shows extra tokens saved with a stable
re-fetch/thrash rate (cross-referenced with the anti-thrashing view). They nudge
the cap to moderate (5–7x) on a non-critical project, watch the thrash rate, and
back off if it rises.

## 3. Glossary
- **Question-aware pruning:** token pruning that scores relevance against the latest
  user query (contrastive perplexity in LongLLMLingua).
- **Extractive vs abstractive:** keep/drop original tokens vs rewrite/summarize.
  Extractive preserves faithfulness; abstractive risks paraphrase errors.
- **Compression ratio:** input-token reduction multiple (2x, 5x, …). Higher =
  cheaper but more accuracy risk.

## 4. Features

### 4.1 Pruning configuration panel
**Description:** Full-knob controls for the pruning engine. Realizes UJ-1.

- **FR-QP-1:** The view must let the user enable/disable question-aware pruning.
- **FR-QP-2:** The view must let the user set a maximum compression ratio (cap), with
  the survey's tiers labeled inline (light 2–3x ≈ <5% accuracy loss; moderate
  5–7x ≈ 5–15%).
- **FR-QP-3:** The view must let the user restrict pruning to **extractive-only**
  (default on) and warn before allowing any abstractive mode.
- **FR-QP-4:** The view must let the user scope pruning by project (workspace) and/or
  content type, so risky data can be excluded.
- **FR-QP-5:** Config persists to the proxy-read config file with active-value
  read-back and drift flagging (as FR-CB-4).

### 4.2 Pruning telemetry
**Description:** Persisted history of pruning outcomes from proxy stats.

- **FR-QP-6:** The view must show extra tokens saved attributable to question-aware
  pruning (vs baseline compression), over a selectable window.
- **FR-QP-7:** The view must show the realized compression ratio distribution and
  flag when it exceeds the user's cap.
- **FR-QP-8:** The view must cross-link the re-fetch/thrash rate (owned by the
  anti-thrashing PRD) so over-pruning is visible in one glance.
- **FR-QP-9:** Per-request, the view must let the user inspect what was pruned,
  reusing the per-message diff already built in the compaction view.

## 5. Success Metrics
- Extra tokens saved beyond baseline compression (primary).
- **Counter-metric:** re-fetch/thrash rate must not rise with pruning aggressiveness
  (shared with anti-thrashing). A quality signal beats a savings signal here.

## 8. Open Questions
- **[PHASE-BLOCKER]** Does the proxy implement question-aware (query-conditioned)
  pruning at all, and expose a ratio cap + extractive/abstractive switch via config?
  If not, this is a future-proxy PRD with desktop config stubbed.
- Can the proxy attribute "extra savings vs baseline" (i.e. isolate pruning's
  contribution), or only report total compression? If only total, FR-QP-6 weakens.

## 9. Assumptions Index
- `[ASSUMPTION]` Pruning relevance scoring (the query-conditioned model) runs
  proxy-side; desktop only sets policy.
- `[ASSUMPTION]` The existing transformations feed can carry pruning metadata so the
  per-request inspection (FR-QP-9) reuses current rendering.
