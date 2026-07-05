import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { CacheStats } from "../../lib/types";
import { cacheHitRate, isCacheUnhealthy } from "../../lib/cacheStats";
import { useTokenReductionConfig } from "../../lib/tokenReductionConfig";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function CachePanel({ configApplies }: { configApplies: boolean }) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { config, update } = useTokenReductionConfig();

  useEffect(() => {
    invoke<CacheStats | null>("get_cache_stats")
      .then((s) => setStats(s))
      .catch(() => setStats(null))
      .finally(() => setLoaded(true));
  }, []);

  const cache = config.cache ?? {};
  const setCache = (patch: Partial<NonNullable<typeof config.cache>>) =>
    void update({ ...config, cache: { ...cache, ...patch } });

  const hit = stats ? cacheHitRate(stats) : null;

  return (
    <div className="cache-panel">
      <section className="cache-panel__telemetry">
        <h2>Cache efficiency</h2>
        {!loaded ? (
          <p className="token-reduction__blurb">Loading…</p>
        ) : !stats ? (
          <p className="cap-gate__msg">
            No cache data yet — the proxy must be running and report
            <code> prefix_cache</code>.
          </p>
        ) : (
          <>
            {isCacheUnhealthy(stats) ? (
              <p className="cache-panel__warning">
                Cache write cost is outweighing read savings — caching may be a net
                loss for this workload.
              </p>
            ) : null}
            <dl className="cache-panel__stats">
              <div>
                <dt>Read hit rate</dt>
                <dd>{hit === null ? "—" : pct(hit)}</dd>
              </div>
              <div>
                <dt>Cache reads</dt>
                <dd>{stats.cacheReadTokens.toLocaleString()} tok</dd>
              </div>
              <div>
                <dt>Cache writes</dt>
                <dd>{stats.cacheWriteTokens.toLocaleString()} tok</dd>
              </div>
              <div>
                <dt>Uncached</dt>
                <dd>{stats.uncachedInputTokens.toLocaleString()} tok</dd>
              </div>
            </dl>
          </>
        )}
      </section>

      <section className="cache-panel__config">
        <h2>Configuration</h2>
        {!configApplies ? (
          <p className="cap-gate__msg">
            Saved here and applied once the proxy supports <code>cache.config.v1</code>.
          </p>
        ) : null}
        <label className="cache-panel__field">
          <input
            type="checkbox"
            checked={cache.enabled ?? false}
            onChange={(e) => setCache({ enabled: e.target.checked })}
          />
          Enable cache-breakpoint insertion
        </label>
        <label className="cache-panel__field">
          Min block tokens
          <input
            type="number"
            min={0}
            value={cache.minBlockTokens ?? 1024}
            onChange={(e) => setCache({ minBlockTokens: Number(e.target.value) })}
          />
        </label>
        <label className="cache-panel__field">
          Max breakpoints
          <input
            type="number"
            min={1}
            max={4}
            value={cache.maxBreakpoints ?? 4}
            onChange={(e) => setCache({ maxBreakpoints: Number(e.target.value) })}
          />
        </label>
        <label className="cache-panel__field">
          <input
            type="checkbox"
            checked={cache.tokenizerAware ?? false}
            onChange={(e) => setCache({ tokenizerAware: e.target.checked })}
          />
          Tokenizer-aware block sizing (per model)
        </label>
      </section>
    </div>
  );
}
