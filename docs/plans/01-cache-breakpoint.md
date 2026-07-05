# Implementation Plan 1 — Cache-Breakpoint Optimization (desktop)

PRD: `docs/prds/01-cache-breakpoint.md`. Depends on Plan 0. **Least gated** — cache
token counts already exist in Anthropic usage payloads the intercept parses.

## Assumed/real proxy contract (`tokenReductionContracts.ts`)
- REAL: per-request usage carries `cache_creation_input_tokens` /
  `cache_read_input_tokens` (Anthropic). The intercept already decodes usage
  (`proxy_intercept.rs` `UsagePayloadJson`). Ingest these directly → telemetry.
- ASSUMED `cache.config.v1`: config keys `enabled`, `min_block_tokens`,
  `max_breakpoints`, `per_model_overrides[]`, `tokenizer_aware`. `PROXY-DEP`: proxy
  honors these.
- ASSUMED `cache.miss_reason.v1`: optional per-request miss reason. If absent,
  FR-CB-7 hides the reason column (CapabilityGate).

## Frontend (`src/components/TokenReduction/CachePanel.tsx`)
- **Config (FR-CB-1..5):** full-knob form (global toggle, min block size, max
  breakpoints, per-model overrides table, tokenizer-aware switch) via
  `useTokenReductionConfig`. Inline blast-radius note on change (FR-CB-5).
- **Telemetry (FR-CB-6..9):** read-hit-rate + $-saved chart over session/day/week
  from `get_token_telemetry`; reuse existing chart components and `modelPricing.ts`
  for $; miss-reason breakdown behind CapabilityGate; "cache health" warning banner
  when window write-cost > read-savings (FR-CB-8).

## Rust
- Extend the telemetry ingestion (Plan 0.C) to aggregate cache token deltas per
  request into the `cache` bucket; compute hit rate + net cache cost server-side so
  the frontend just renders.
- No new hot-path code; aggregation runs in the existing poll loop.

## Tests
- Rust: hit-rate + net-cost math on synthetic buckets; health-flag threshold.
- Vitest: CachePanel renders health warning when net cost positive; hides
  miss-reason column when capability absent.
- `tsc`, `cargo check`, `check:colors`, light/dark.
