// Single source of truth for the (mostly assumed) proxy contracts the Token
// Reduction suite depends on. See docs/plans/proxy-dependencies.md. When the proxy
// ships a capability, only this file + the Tauri fetchers change.

// Capability keys the proxy reports it supports (drives CapabilityGate).
export type Capability =
  | "cache.config.v1"
  | "cache.miss_reason.v1"
  | "routing.config.v1"
  | "routing.decisions.v1"
  | "pruning.config.v1"
  | "pruning.stats.v1"
  | "ccr.browse.v1"
  | "ccr.config.v1"
  | "token_stats.v1";

// Desktop-written config the proxy is assumed to read. All optional — absent keys
// mean "proxy default". Loosely typed on purpose; feature plans flesh out shapes.
export interface TokenReductionConfig {
  cache?: {
    enabled?: boolean;
    minBlockTokens?: number;
    maxBreakpoints?: number;
    tokenizerAware?: boolean;
    perModelOverrides?: Array<{ model: string; minBlockTokens?: number }>;
  };
  routing?: {
    mode?: "off" | "pure-router" | "cascade";
    ladder?: Array<{ model: string; role?: "default" | "escalation" }>;
    complexityThreshold?: number;
    confidenceThreshold?: number;
    maxEscalationDepth?: number;
    overrideRules?: Array<{ workspace: string; model: string }>;
  };
  pruning?: {
    enabled?: boolean;
    maxRatio?: number;
    extractiveOnly?: boolean;
  };
  ccr?: {
    ttlSeconds?: number;
    maxStoreBytes?: number;
    evictionPolicy?: "lru" | "lrr" | "fifo";
  };
}
