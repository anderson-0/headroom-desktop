---
title: PRD — Cache-Breakpoint Optimization (desktop)
status: draft
created: 2026-06-29
updated: 2026-06-29
---

# PRD: Cache-Breakpoint Optimization

> Scope: desktop config + telemetry only. Engine (where breakpoints are placed in
> the outgoing request) lives in the proxy. See
> [overview](00-token-reduction-overview.md).

## 0. Document Purpose
Define the desktop surface that lets a user configure prompt-cache breakpoint
behavior and observe cache efficiency. Inputs: token-reduction survey §1.1.

## 1. Vision
Prompt caching is the highest-ROI, zero-quality-risk lever (up to ~90% read cost
cut), but only if breakpoints land on large stable prefixes and nothing mutates
cached bytes. The desktop makes cache efficiency **visible and tunable** so the
user can see hit rates and fix the dynamic-content-too-early mistake that silently
destroys caching.

## 2. Target User
Single desktop operator running Claude Code / agents through Headroom who wants to
cut cost without touching quality.

### 2.1 Jobs To Be Done
- See whether prompt caching is actually working (hit rate, $ saved from reads).
- Understand *why* a cache miss happened (prefix changed, block too small).
- Tune breakpoint count/placement and minimum block size per model.

### 2.3 Key User Journey
**UJ-1 — "Why am I not saving more?"** Operator opens Token Reduction → Cache.
Sees cache-read hit rate is 22%. A "cache health" panel flags *"dynamic content in
system prefix — 3 breakpoints wasted."* They raise the minimum block size and
enable per-model tokenizer-aware sizing; over the next sessions the persisted
history chart shows hit rate climbing to ~70%.

## 3. Glossary
- **Cache breakpoint:** marker telling the provider where a cacheable prefix ends
  (Anthropic: up to 4, ordered tools → system → messages).
- **Cache write / read:** first-time cache population (premium) vs reuse (discount).
- **Block:** contiguous prefix region; must exceed the model's token minimum
  (~1,024; lower for Haiku) to cache.

## 4. Features

### 4.1 Cache configuration panel
**Description:** Full-knob controls for breakpoint behavior, written to proxy
config. Per-model overrides because tokenizers differ (newer models can tokenize
the same text up to ~35% differently, changing block sizing). Realizes UJ-1.

- **FR-CB-1:** The view must let the user enable/disable prompt-cache breakpoint
  insertion globally.
- **FR-CB-2:** The view must let the user set the minimum cacheable block size (in
  tokens) and the maximum number of breakpoints, with per-model overrides.
- **FR-CB-3:** The view must let the user choose tokenizer-aware sizing per model
  (so block thresholds are computed against that model's tokenizer).
- **FR-CB-4:** The view must persist config by writing to the Headroom config file
  the proxy reads, and reflect the currently-active values (read-back), flagging
  drift if the proxy reports different effective values.
- **FR-CB-5:** Changing a value must show its blast radius inline (e.g. "applies to
  next request; existing caches expire in ≤5 min").

### 4.2 Cache efficiency telemetry
**Description:** Persisted history of cache performance from proxy-reported stats
(`cache_creation_input_tokens`, `cache_read_input_tokens`, etc.). Realizes UJ-1.

- **FR-CB-6:** The view must show current and historical **cache-read hit rate**
  and **tokens/$ saved from reads**, over a selectable window (session / day /
  week).
- **FR-CB-7:** The view must attribute misses to a reason where the proxy provides
  it (prefix changed, block below minimum, TTL expired, breakpoint budget
  exhausted).
- **FR-CB-8:** The view must surface a "cache health" flag when write cost exceeds
  read savings over the window (the "enabled but rarely hit = net loss" failure
  mode).
- **FR-CB-9 (NFR, feature-specific):** All cache numbers are labeled by source
  (proxy-measured vs estimated); never fabricated when a field is absent (NFR-G2).

## 5. Success Metrics
- Cache-read hit rate (primary; target: user can raise it after using the panel).
- Tokens/$ saved from cache reads over time.
- **Counter-metric:** net cache cost (writes − reads) must not go positive
  unnoticed — the health flag must fire when it does.

## 8. Open Questions
- **[PHASE-BLOCKER]** Does the proxy read breakpoint config from the desktop-written
  config file, and does it emit per-reason miss attribution? If not, FR-CB-2/3/7
  degrade to read-only display. (Shared config-transport question.)
- Are cache stats available per-request from the existing transformations feed, or
  is a new proxy stats endpoint needed?

## 9. Assumptions Index
- `[ASSUMPTION]` Proxy already returns cache token counts in usage payloads
  (Anthropic does via `cache_*_input_tokens`); desktop only needs to read/aggregate.
- `[ASSUMPTION]` Per-model tokenizer sizing is computed proxy-side; desktop just
  toggles it.
