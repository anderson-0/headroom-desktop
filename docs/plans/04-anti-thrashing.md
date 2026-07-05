# Implementation Plan 4 — Anti-Thrashing Telemetry (desktop)

PRD: `docs/prds/04-anti-thrashing.md`. Depends on Plan 0. **Partially unblocked**:
the Rust intercept already parses request bodies, so detection can live desktop-side
without proxy changes.

## Detection approach (REVISED after code verification)
**Correction:** the Rust intercept (`proxy_intercept.rs`) is a byte-splicing
forwarder — it does "opaque copy (request body)" and only parses headers/tokens. It
does NOT see message bodies, tool_results, or CCR markers. The original
"detect in the intercept" plan is not feasible without proxy changes.

**Real desktop-only signal:** the transformations feed's `transformsApplied` already
carries `read_lifecycle:*` markers the proxy emits:
- `read_lifecycle:superseded` ("file re-read later") = the **thrash signal** — the
  agent re-read previously-seen, unchanged content.
- `read_lifecycle:stale` ("file edited after read") = a **legitimate change**, NOT
  thrash (this is the FR-AT counter-metric false-positive — exclude it).

So thrash detection = analyzing the feed the desktop already fetches
(`get_transformations_feed`), counting events with `superseded`/`reread` markers,
excluding `stale`. **No proxy change, no `--log-messages` dependency.** It lives in
the feed consumer (frontend), not the intercept.

Limitation: this is a directional rate over the fetched feed window, not a
content-hash-exact re-fetch trace. Cross-session trend needs the deferred
`token_telemetry.rs` history store.

## Frontend (`src/components/TokenReduction/ThrashingPanel.tsx`)
- **Telemetry (FR-AT-3..7):** thrash-rate + trend chart (sudden rise after a config
  change is the key visual); recent thrash-event list (content, first-compacted,
  re-fetched, est. wasted tokens); project filter; each event links to the
  originating compaction's per-message diff (reuse compaction-history view).
- **Alerting (FR-AT-5):** user-set thrash-rate threshold → non-blocking banner +
  reuse existing `show_notification` plumbing.

## Rust
- `proxy_intercept.rs`: compacted-index + thrash detection, strictly observe-only
  (NFR-G1 — never blocks forwarding).
- Append thrash events to the `thrashing` telemetry bucket (Plan 0.C); compute
  thrash rate server-side.
- Track a detection false-positive guard: only count when content hash differs from
  the last *known* version of that path (counter-metric, PRD §5).

## Tests
- Rust: thrash detection — true positive (compacted content re-fetched), true
  negative (legitimately changed file), polling guard (don't double-count rapid
  repeats — mirror existing read-lifecycle gap logic).
- Vitest: threshold banner fires; event links resolve; project filter.
- `tsc`, `cargo check --manifest-path src-tauri/Cargo.toml`,
  `cargo test ... --lib proxy_intercept`, `check:colors`, light/dark.
