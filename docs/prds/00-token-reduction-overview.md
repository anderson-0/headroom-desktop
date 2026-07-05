---
title: Token Reduction Suite — PRD Index
status: draft
created: 2026-06-29
updated: 2026-06-29
---

# Token Reduction Suite (headroom-desktop)

Desktop-only deliverables for five token-reduction features surfaced by
[`research/token-reduction-survey.md`](../../research/token-reduction-survey.md).

## Shared context (applies to all five PRDs)

- **Product:** `headroom-desktop` — Tauri app (React frontend + Rust backend) that
  supervises the Python optimization proxy (backend on 6768, always-on intercept
  on 6767) and is the user's dashboard/control plane.
- **Scope boundary:** these PRDs scope **only what the desktop ships** — config UI
  and observability. The proxy *engines* (caching, routing, pruning, paging) are
  assumed implemented in the Python `headroom` repo and are **out of scope** here.
  Each PRD names its proxy dependency explicitly.
- **Locked product decisions** (from stakeholder Q&A 2026-06-29):
  1. All config + telemetry live in **one new dedicated "Token Reduction" view**
     (new top-level section in the app, peer to the existing activity views).
  2. Telemetry is **persisted as rolling history** (new Rust state, modeled on
     `activity_facts.rs` / `activity-facts.json`), not live-only.
  3. Config UI exposes **full knobs** (raw thresholds, mappings, ratios), not just
     presets.
- **User:** single desktop operator — the Headroom user managing their own
  optimization. No multi-tenant, no roles.
- **Config transport** `[ASSUMPTION]`: the desktop writes feature config into the
  Headroom config file the proxy already reads
  (`~/Library/Application Support/Headroom/config/`), and the proxy hot-reloads or
  reads it on next request. Confirming this contract is a shared **phase-blocker
  open question** (see each PRD).

## The five PRDs

| # | PRD | FR prefix | Proxy dependency |
|---|-----|-----------|------------------|
| 1 | [Cache-breakpoint optimization](01-cache-breakpoint.md) | `FR-CB` | Proxy emits cache hit/write/read + breakpoint stats |
| 2 | [Confidence/complexity routing](02-routing.md) | `FR-RT` | Proxy implements router + emits per-request routing decisions |
| 3 | [Question-aware pruning](03-question-aware-pruning.md) | `FR-QP` | Proxy implements query-conditioned pruning + emits pruning stats |
| 4 | [Anti-thrashing telemetry](04-anti-thrashing.md) | `FR-AT` | Proxy/intercept emits re-read events for compacted content |
| 5 | [External-memory paging / CCR browser](05-external-memory-paging.md) | `FR-MP` | Proxy writes durable CCR store; desktop reads it |

## Cross-cutting NFRs (inherited by all five)

- **NFR-G1 (no-regression):** the Token Reduction view must never block or slow the
  proxy request path; all desktop reads are async/off the hot path.
- **NFR-G2 (degrade gracefully):** when the proxy is older/missing a capability or a
  stat field, the view shows an explicit "not available — requires proxy vX" hint,
  never fabricated numbers (mirrors the per-message-tokens fallback already shipped).
- **NFR-G3 (theming):** all UI uses semantic CSS tokens; verified light + dark
  (`npm run check:colors`).
- **NFR-G4 (persistence safety):** telemetry history is schema-versioned and resets
  cleanly on schema mismatch (mirrors `activity_facts.rs` `SCHEMA_VERSION`).
