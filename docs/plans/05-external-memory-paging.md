# Implementation Plan 5 — External-Memory Paging / CCR Store Browser (desktop)

PRD: `docs/prds/05-external-memory-paging.md`. Depends on Plan 0. **Store is REAL**:
the proxy already persists a CCR store (`config.py CCRConfig`,
`transforms/cache/compression_store.py`, `DEFAULT_CCR_TTL_SECONDS`). So this is a
read/inspect + retention-config feature, not a stub.

## Real/assumed proxy contract (`tokenReductionContracts.ts`)
- REAL: CCR store persisted under `~/Library/Application Support/Headroom/`
  (confirm exact path/format from `compression_store.py`). TTL configurable.
- ASSUMED `ccr.browse.v1`: a read endpoint OR documented on-disk format the desktop
  can enumerate `{marker_id, source(path/tool/message), size, created_at,
  retrieval_count, expires_at, workspace}` + fetch full content by id. `PROXY-DEP`:
  prefer a proxy endpoint over direct file reads to avoid coupling to on-disk format.
- ASSUMED `ccr.config.v1`: `ttl_seconds`, `max_store_bytes`, `eviction_policy`.

## Frontend (`src/components/TokenReduction/MemoryPanel.tsx`)
- **Browser (FR-MP-1..4):** entry list (id, source, size, created, retrieval count,
  expiry); open-entry view showing **full original content**; search/filter by path,
  workspace, retrieved-vs-never; store-level stats (total size, count, retrieval hit
  rate, tokens-kept-out-of-context).
- **Retention (FR-MP-5..7):** TTL + max-size inputs + eviction-policy selector;
  manual evict / clear-store with a confirm dialog (irreversible — confirm per
  harness "hard-to-reverse" rule); read-back + drift flag.
- **Privacy (PRD open-Q):** entry content may contain secrets/source; apply the same
  redaction the proxy uses (`redact_image_base64` + secret patterns) before display,
  or fetch already-redacted content from the proxy endpoint.

## Rust
- Tauri commands: `list_ccr_entries(filter)`, `get_ccr_entry(id)`,
  `evict_ccr_entry(id)`, `clear_ccr_store()` — proxied to the assumed `ccr.browse.v1`
  endpoint (preferred) or reading the documented store path.
- Feed store-level stats into the `memory` telemetry bucket for the retrieval-hit-
  rate trend.

## Stub behavior
- If `ccr.browse.v1` endpoint absent but on-disk store present: offer read-only
  enumeration from disk behind a "best-effort, format may change" note.
- If neither: CapabilityGate hint.

## Tests
- Rust: list/get/evict against a fixture store; redaction applied before return.
- Vitest: filter (retrieved vs never); clear-store confirm gate; retrieval-hit-rate
  stat renders.
- `tsc`, `cargo check`, `cargo test`, `check:colors`, light/dark.

## Open dependency
- Confirm `compression_store.py` exposes (or can expose) a browse endpoint;
  otherwise document the on-disk format. Logged in `docs/plans/proxy-dependencies.md`.
