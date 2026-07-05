# Implementation Plan 2 — Confidence/Complexity Routing (desktop)

PRD: `docs/prds/02-routing.md`. Depends on Plan 0. **Gated**: needs proxy router +
per-request routing decisions. Built as config-stub + dashboard that lights up on
capability.

## Assumed proxy contract (`tokenReductionContracts.ts`)
- ASSUMED `routing.config.v1`: `mode` (off|pure-router|cascade), `ladder[]`
  (model id + role), `complexity_threshold`, `confidence_threshold`,
  `max_escalation_depth`, `override_rules[]`. `PROXY-DEP`.
- ASSUMED `routing.decisions.v1`: per-request `{chosen_model, score, escalated,
  final_model, reason, workspace}`. `PROXY-DEP`. Drives all telemetry; absent →
  CapabilityGate covers the whole telemetry tab.

## Frontend (`src/components/TokenReduction/RoutingPanel.tsx`)
- **Config (FR-RT-1..5):** mode selector; ladder editor (ordered model rows, add/
  remove, role tag); threshold inputs; override-rule rows (workspace→model);
  read-back + drift flag. Validate ladder models exist in `modelPricing.ts` (warn
  if a ladder model has no pricing → savings estimate degrades).
- **Telemetry (FR-RT-6..9):** per-model request distribution + estimated $ saved vs
  always-top-model (counterfactual from `modelPricing.ts` if proxy doesn't report
  it); recent-decisions list; escalation-rate metric with the
  "cascade-overhead eroding savings" flag (FR-RT-8); project filter reusing
  `workspaceBasename` + the compaction-history filter pattern.

## Rust
- Telemetry ingestion (Plan 0.C) appends `routing.decisions.v1` into the `routing`
  bucket; compute distribution + escalation rate server-side.
- `set_token_reduction_config` writes the routing sub-config.

## Stub behavior
- With `routing.*` capability absent: config form is editable and persists (so the
  user can pre-stage policy) but shows "inactive until proxy supports routing";
  telemetry tab is a single CapabilityGate hint.

## Tests
- Rust: distribution + escalation-rate aggregation; savings counterfactual math.
- Vitest: ladder editor validation (unknown-pricing warning); telemetry gated when
  capability missing; project filter narrows decisions.
- `tsc`, `cargo check`, `check:colors`, light/dark.
