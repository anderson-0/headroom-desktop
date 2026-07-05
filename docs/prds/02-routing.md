---
title: PRD — Confidence/Complexity Routing (desktop)
status: draft
created: 2026-06-29
updated: 2026-06-29
---

# PRD: Confidence/Complexity Routing

> Scope: desktop config + telemetry only. Router engine lives in the proxy. See
> [overview](00-token-reduction-overview.md).

## 0. Document Purpose
Define the desktop surface to configure model routing (route each request to the
cheapest capable model) and observe routing decisions, savings, and escalations.
Inputs: token-reduction survey §2.

## 1. Vision
A provider-agnostic proxy is the natural place to route per-request to the cheapest
model that can do the job (production teams see 40–70% cost cuts). The desktop lets
the user define the model ladder and routing policy, then see exactly what got
routed where and what it saved — with full visibility into mis-routes so trust is
earned, not assumed.

## 2. Target User
Single desktop operator who wants lower cost without quality regressions and is
willing to inspect routing behavior.

### 2.1 Jobs To Be Done
- Define which models are in the ladder and their cost/capability order.
- Set the policy (pure router vs confidence cascade) and thresholds.
- See per-request routing decisions and whether cheap routes were later escalated
  (a quality-risk signal).

### 2.3 Key User Journey
**UJ-1 — "Trust but verify the cheap model."** Operator enables routing in
balanced mode with Haiku→Sonnet→Opus ladder. Over a day, the routing telemetry
shows 64% of requests served by Haiku, 9% escalated to Sonnet on low confidence,
$X saved. They drill into the escalations, see they were all complex multi-file
edits, and tighten the complexity classifier threshold so those route straight to
Sonnet — cutting wasted Haiku attempts (the cascade rejected-stage cost).

## 3. Glossary
- **Pure router:** classify once, dispatch to one model (pays one model's cost).
- **Confidence cascade:** try cheap first, escalate if low confidence (pays
  rejected stages too — costly in multi-step agent loops).
- **Ladder:** ordered list of models by cost/capability.
- **Escalation:** a request that started cheap and was promoted to a stronger model.

## 4. Features

### 4.1 Routing policy & ladder configuration
**Description:** Full-knob config for the routing engine. Realizes UJ-1.

- **FR-RT-1:** The view must let the user enable/disable routing and choose policy
  mode: **off / pure-router / confidence-cascade**.
- **FR-RT-2:** The view must let the user define the model ladder (ordered models),
  including per-model role (e.g. default, escalation target).
- **FR-RT-3:** The view must let the user set routing thresholds directly
  (complexity-classifier cutoff for pure-router; confidence threshold + max
  escalation depth for cascade).
- **FR-RT-4:** The view must let the user pin override rules (e.g. "always route
  requests from workspace X to model Y").
- **FR-RT-5:** Config persists to the proxy-read config file with active-value
  read-back and drift flagging (as FR-CB-4).

### 4.2 Routing telemetry
**Description:** Persisted history of routing decisions reported by the proxy.

- **FR-RT-6:** The view must show, over a selectable window, the **distribution of
  requests per model** and **estimated $ saved vs always-using-the-top-model**.
- **FR-RT-7:** The view must list recent routing decisions with: chosen model,
  reason/score, whether escalated, and final model.
- **FR-RT-8:** The view must surface an **escalation-rate** metric and flag when
  cascade rejected-stage overhead is eroding savings (the multi-step-agent failure
  mode named in the survey).
- **FR-RT-9:** Routing telemetry must be filterable by project (workspace), reusing
  the project-filter pattern from the compaction history view.

## 5. Success Metrics
- Cost saved vs top-model baseline (primary).
- Share of requests served by cheaper models.
- **Counter-metric:** escalation rate and any quality-regression signal the proxy
  exposes (e.g. user-visible retries). High escalation = routing too aggressive.

## 8. Open Questions
- **[PHASE-BLOCKER]** Does the proxy expose a routing decision per request (chosen
  model, score, escalation path)? Without it, FR-RT-6/7/8 cannot be built.
- **[PHASE-BLOCKER]** Does the proxy accept a desktop-defined ladder + thresholds via
  config? If routing is hardcoded proxy-side, this PRD collapses to telemetry-only.
- How is "savings vs top model" computed — does the proxy report counterfactual
  cost, or does the desktop estimate from per-model pricing? (Pricing data already
  exists in `modelPricing.ts`.)
- Quality-regression signal: is there any measured quality delta, or only
  escalation as a proxy for it?

## 9. Assumptions Index
- `[ASSUMPTION]` Routing is a proxy capability; desktop never makes the routing
  decision itself.
- `[ASSUMPTION]` Per-model pricing for the savings estimate comes from existing
  desktop pricing tables; new models in the ladder must exist there.
