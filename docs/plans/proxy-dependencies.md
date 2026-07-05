# Proxy dependencies for the Token Reduction suite

Desktop plans assume these proxy-side contracts. Items marked REAL exist today;
ASSUMED items are the gate for the corresponding feature. The desktop builds against
`src/lib/tokenReductionContracts.ts`; lighting up a feature = the proxy satisfying
its row here.

| Capability key | Status | Needed by | Notes |
|---|---|---|---|
| `cache_*_input_tokens` in usage | REAL | Plan 1 | Anthropic usage; intercept already decodes it |
| `cache.config.v1` (breakpoint knobs) | ASSUMED | Plan 1 | Proxy must read desktop-written config |
| `cache.miss_reason.v1` | ASSUMED | Plan 1 | Optional; degrades to hidden column |
| `routing.config.v1` | ASSUMED | Plan 2 | Ladder + thresholds from config |
| `routing.decisions.v1` | ASSUMED | Plan 2 | Per-request decision; gates all routing telemetry |
| `pruning.config.v1` | ASSUMED | Plan 3 | ratio cap + extractive-only switch |
| `pruning.stats.v1` (marginal attribution) | ASSUMED | Plan 3 | Else degrade to total-compression |
| Thrash detection | REAL (desktop) | Plan 4 | Done in Rust intercept; no proxy change required |
| CCR durable store | REAL | Plan 5 | `config.py CCRConfig`, `transforms/cache/compression_store.py` |
| `ccr.browse.v1` (enumerate + fetch) | ASSUMED | Plan 5 | Prefer endpoint over on-disk coupling |
| `ccr.config.v1` (TTL/size/eviction) | ASSUMED | Plan 5 | TTL already configurable proxy-side |
| Config transport (desktop file → proxy) | ASSUMED | All | Shared phase-blocker: does proxy read the desktop config file? |
| `/token-stats` snapshot endpoint | ASSUMED | All telemetry | Aggregated per-feature stats for the poll loop |

**Single shared phase-blocker:** the config-transport contract. If the proxy does
not read a desktop-written config file, every config panel collapses to read-only
display of proxy-reported effective values. Resolve this first.
