import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { Capability } from "../../lib/tokenReductionContracts";
import { CachePanel } from "./CachePanel";
import { ThrashingPanel } from "./ThrashingPanel";
import { RoutingPanel } from "./RoutingPanel";
import { PruningPanel } from "./PruningPanel";
import { MemoryPanel } from "./MemoryPanel";
import { ImagingPanel } from "./ImagingPanel";

interface TabDef {
  id: string;
  label: string;
  capability: Capability;
  blurb: string;
}

// Tabs map to the five feature plans (docs/plans/01-05). Bodies are filled in by
// each feature plan; until the proxy reports a capability, CapabilityGate covers
// the tab. ponytail: no panel bodies yet — gates are the correct empty state.
const TABS: TabDef[] = [
  { id: "cache", label: "Cache", capability: "cache.config.v1", blurb: "Prompt-cache breakpoints and hit-rate telemetry." },
  { id: "routing", label: "Routing", capability: "routing.config.v1", blurb: "Route each request to the cheapest capable model." },
  { id: "pruning", label: "Pruning", capability: "pruning.config.v1", blurb: "Question-aware context pruning." },
  { id: "thrashing", label: "Thrashing", capability: "token_stats.v1", blurb: "Detect re-reads of compacted content." },
  { id: "memory", label: "Memory", capability: "ccr.browse.v1", blurb: "Browse the CCR store of paged-out content." },
  { id: "imaging", label: "Imaging", capability: "imaging.local.v1", blurb: "Render bulky context as dense images to cut input tokens (pxpipe)." }
];

export function TokenReductionView() {
  const [tab, setTab] = useState<string>(TABS[0].id);
  const [capabilities, setCapabilities] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("get_token_reduction_capabilities")
      .then(setCapabilities)
      .catch(() => setCapabilities([]));
  }, []);

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const has = (c: Capability) => capabilities.includes(c);

  return (
    <section className="token-reduction">
      <header className="token-reduction__header">
        <h1>Savings</h1>
        <p className="token-reduction__subtitle">
          Configure and observe Headroom's token-reduction features.
        </p>
      </header>

      <nav className="token-reduction__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            className={`token-reduction__tab${t.id === tab ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="token-reduction__panel" role="tabpanel">
        <p className="token-reduction__blurb">{active.blurb}</p>
        {active.id === "cache" ? (
          // Real data today (prefix_cache); config applies once proxy honors cache.config.v1.
          <CachePanel configApplies={has("cache.config.v1")} />
        ) : active.id === "thrashing" ? (
          // Real today — derived from the feed's read_lifecycle markers.
          <ThrashingPanel />
        ) : active.id === "routing" ? (
          <RoutingPanel
            configApplies={has("routing.config.v1")}
            telemetryAvailable={has("routing.decisions.v1")}
          />
        ) : active.id === "pruning" ? (
          <PruningPanel
            configApplies={has("pruning.config.v1")}
            telemetryAvailable={has("pruning.stats.v1")}
          />
        ) : active.id === "memory" ? (
          <MemoryPanel
            configApplies={has("ccr.config.v1")}
            browseAvailable={has("ccr.browse.v1")}
          />
        ) : (
          <ImagingPanel available={has("imaging.local.v1")} />
        )}
      </div>
    </section>
  );
}
