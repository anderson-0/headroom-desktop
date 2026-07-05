# Implementation Plan 0 — Token Reduction shared infrastructure

Built once; the five feature plans depend on it. Desktop-only. Gated features are
built against **assumed proxy contracts** centralized in one module so they light up
when the proxy ships (per stakeholder choice: "plan all 5 with stubs").

## Context
PRDs in `docs/prds/` define a new dedicated "Token Reduction" view with persisted
telemetry history and full-knob config. Every feature shares: a nav entry + view, a
persisted telemetry store, a config read/write path to the proxy, and a graceful
"capability missing" fallback. Build these once here.

## A. Navigation + view shell
- `src/App.tsx`: add `"tokenReduction"` to the `TrayView` type and a `navItems`
  entry (`{ id: "tokenReduction", label: "Savings", icon: Gauge }` — phosphor icon,
  matching existing `Sliders`/`Bell` usage at `App.tsx:178-181`). Add a render
  branch like the existing `activeView === "notifications"` block.
- New `src/components/TokenReduction/index.tsx`: tabbed shell with 5 sub-tabs
  (Cache / Routing / Pruning / Thrashing / Memory), each rendering its feature panel.
  Reuse the existing tab/section CSS patterns.

## B. Assumed proxy contract module (the seam)
- New `src/lib/tokenReductionContracts.ts`: single source of truth for every
  assumed proxy stat shape and config key. Each contract carries a `capability`
  string (e.g. `"routing.decisions.v1"`). When the real proxy ships, only this file
  + the Tauri fetchers change.
- New `src/components/TokenReduction/CapabilityGate.tsx`: given a `capability` and
  whether the proxy reports it, renders children or an explicit
  "Requires Headroom proxy with <capability>" hint (NFR-G2). No fabricated numbers.

## C. Persisted telemetry store (Rust)
- New `src-tauri/src/token_telemetry.rs`, modeled directly on `activity_facts.rs`:
  - `SCHEMA_VERSION` const; `PersistedTokenTelemetry` with per-feature rolling
    buckets (cache, routing, pruning, thrashing, memory), each a capped time-series.
  - Load/save via `storage::config_file(&app_data_dir(), "token-telemetry.json")`;
    reset on schema mismatch (mirror `activity_facts.rs:265`).
  - Ingestion: extend the existing proxy-stats poll (the loop that already calls
    `fetch_transformations_feed`) to also pull a new `/token-stats` snapshot
    `[ASSUMPTION: proxy endpoint]` and append buckets. Off the hot path (NFR-G1).
- Tauri commands (register in `lib.rs` invoke_handler alongside
  `get_transformations_feed`):
  - `get_token_telemetry(window: "session"|"day"|"week") -> TokenTelemetry`
  - `get_token_reduction_capabilities() -> Vec<String>` (what the proxy reports it
    supports; drives `CapabilityGate`).

## D. Config read/write path
- Tauri commands:
  - `get_token_reduction_config() -> TokenReductionConfig` — reads
    `config_file(app_data_dir(), "token-reduction-config.json")`, merged with the
    proxy's reported *effective* values for drift detection.
  - `set_token_reduction_config(cfg)` — writes that file `[ASSUMPTION: the proxy
    hot-reloads / reads this file]`.
- Frontend `src/lib/tokenReductionConfig.ts`: typed load/save wrappers + a
  `useTokenReductionConfig` hook with optimistic write + read-back drift flag
  (reused by all config panels).

## E. Phase-blocker tracking
- All `[ASSUMPTION]`/`[PHASE-BLOCKER]` proxy contracts live as typed entries in
  `tokenReductionContracts.ts` with a `// PROXY-DEP:` comment. A short
  `docs/plans/proxy-dependencies.md` lists them so the proxy team has one checklist.

## Verification (Plan 0)
- `npx tsc --noEmit`; `cargo check --manifest-path src-tauri/Cargo.toml`.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib token_telemetry`
  (schema-version reset + bucket capping, mirroring activity_facts tests).
- `npm run check:colors`; verify the new view renders empty-state in light + dark.
- With no proxy capabilities reported, the whole view shows CapabilityGate hints
  (no crashes, no fake data).
