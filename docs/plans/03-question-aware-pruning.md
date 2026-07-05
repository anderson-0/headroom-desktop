# Implementation Plan 3 — Question-Aware Pruning (desktop)

PRD: `docs/prds/03-question-aware-pruning.md`. Depends on Plan 0. **Gated**: needs
proxy query-conditioned pruning + per-feature attribution. Config-stub + dashboard.

## Assumed proxy contract (`tokenReductionContracts.ts`)
- ASSUMED `pruning.config.v1`: `enabled`, `max_ratio`, `extractive_only` (default
  true), `scope` (workspace/content-type allow/deny). `PROXY-DEP`.
- ASSUMED `pruning.stats.v1`: per-request `{extra_tokens_saved_vs_baseline,
  realized_ratio, workspace}`. `PROXY-DEP`. If proxy reports only total compression
  (not pruning's marginal contribution), FR-QP-6 degrades to "total compression" and
  is labeled as such (CapabilityGate variant).

## Frontend (`src/components/TokenReduction/PruningPanel.tsx`)
- **Config (FR-QP-1..5):** enable toggle; max-ratio slider with the survey's tier
  labels inline (light 2–3x <5% loss; moderate 5–7x 5–15%); extractive-only switch
  with a confirm dialog before allowing abstractive (FR-QP-3); scope by
  workspace/content-type; read-back + drift flag.
- **Telemetry (FR-QP-6..9):** extra-tokens-saved chart; realized-ratio distribution
  with over-cap flag; **embed the thrash-rate metric** from the thrashing telemetry
  bucket (FR-QP-8 cross-link — shared store, no new fetch); per-request "what was
  pruned" inspection reusing the per-message diff + `PerMessageTokens` already built
  in `ActivityFeed.tsx` (export/reuse `CompressionDiff`).

## Rust
- Ingestion (Plan 0.C) appends `pruning.stats.v1` to the `pruning` bucket.
- Reuse the thrashing bucket read for the cross-linked metric.

## Stub behavior
- `pruning.*` absent: config persists but marked inactive; telemetry gated; the
  per-request inspector still works for any event that already carries message
  arrays (today's compaction data).

## Tests
- Vitest: tier labels track slider; abstractive confirm gate; over-cap flag; reuse
  of CompressionDiff renders pruned diff.
- Rust: extra-savings aggregation; degrade path when only total compression present.
- `tsc`, `cargo check`, `check:colors`, light/dark.
