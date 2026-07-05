---
title: PRD — External-Memory Paging / CCR Store Browser (desktop)
status: draft
created: 2026-06-29
updated: 2026-06-29
---

# PRD: External-Memory Paging / CCR Store Browser

> Scope: desktop browse/inspect + config only. The durable store is written by the
> proxy. See [overview](00-token-reduction-overview.md).

## 0. Document Purpose
Define the desktop surface to browse, inspect, and manage the **content-addressable
retrieval (CCR) store** — the durable home of content the proxy paged out of context
— and to configure its retention. Inputs: token-reduction survey §4/§6.

## 1. Vision
Headroom already pages lossy drops behind CCR retrieval markers. Extending that to a
**durable, re-readable store** turns compaction into paging-out instead of
throwing-away: the model can pull content back when needed, and the user can see
what's been offloaded. The desktop is the window into that store — what's paged,
how big, how often retrieved, and when it expires.

## 2. Target User
Single desktop operator who wants confidence that "compacted" never means "lost,"
and control over how long offloaded content is kept.

### 2.1 Jobs To Be Done
- Browse what content has been paged out (CCR store) and read any entry in full.
- See retrieval activity (was paged content actually pulled back?).
- Configure retention (TTL / size cap) for the store.

### 2.3 Key User Journey
**UJ-1 — "Where did my big file go?"** Operator notices a 40KB tool_result vanished
from a request. They open Token Reduction → Memory, search the CCR store by path,
find the entry, read its full original content, and see it was retrieved twice by the
agent later. Reassured it's paging not loss, they set a 7-day TTL and a 500MB cap.

## 3. Glossary
- **CCR store:** content-addressable store holding content the proxy dropped from
  context, keyed by hash, referenced inline by a `<<ccr:HASH …>>` marker.
- **Paging:** moving content out of the live request into the store, retrievable on
  demand (vs deletion).
- **Retrieval:** the agent/model pulling a stored entry back into context.

## 4. Features

### 4.1 CCR store browser
**Description:** Read-only inspection of the durable store the proxy writes.
Realizes UJ-1.

- **FR-MP-1:** The view must list CCR store entries with: marker id/hash, source
  (path / tool / message), size, created-at, retrieval count, expiry.
- **FR-MP-2:** The view must let the user open an entry and read its **full original
  content** (the pre-compaction text).
- **FR-MP-3:** The view must be searchable/filterable by source path, project
  (workspace), and "retrieved vs never-retrieved."
- **FR-MP-4:** The view must show store-level stats: total size, entry count,
  retrieval hit rate (retrieved / total), tokens kept out of context.

### 4.2 Retention configuration
**Description:** Full-knob control over store lifecycle, written to proxy config.

- **FR-MP-5:** The view must let the user set retention TTL and a maximum store size
  (with eviction policy surfaced — e.g. evict least-recently-retrieved first).
- **FR-MP-6:** The view must let the user manually evict an entry or clear the store,
  with a confirmation (irreversible action).
- **FR-MP-7:** Config persists to the proxy-read config file with active-value
  read-back and drift flagging (as FR-CB-4).

## 5. Success Metrics
- Retrieval hit rate (how often paged content is actually pulled back) — validates
  that paging beats deletion.
- Tokens kept out of context (savings) vs store size (cost).
- **Counter-metric:** entries that expire/evict and are *then* needed (a re-fetch
  miss against the store) — too-short TTL causing loss. Cross-links anti-thrashing.

## 8. Open Questions
- **[PHASE-BLOCKER]** Does the proxy actually persist a durable CCR store today, or are
  markers ephemeral (in-memory per request)? If ephemeral, the durable store is a
  proxy prerequisite and this PRD's browser has nothing to read yet.
- Where does the store live on disk, and is it safe for the desktop to read directly
  vs via a proxy endpoint? (Survey notes config/state under
  `~/Library/Application Support/Headroom/`.)
- Privacy: paged content may contain secrets/source — does the browser need
  redaction, mirroring the proxy's `redact_image_base64` / secret handling?

## 9. Assumptions Index
- `[ASSUMPTION]` CCR markers reference a retrievable backing store (the survey and
  proxy `smart_crusher` describe CCR marker emission + store write).
- `[ASSUMPTION]` The desktop reads the store via a proxy endpoint or a documented
  on-disk format; it does not own the store's write path.
