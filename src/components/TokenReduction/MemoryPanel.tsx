import { useTokenReductionConfig } from "../../lib/tokenReductionConfig";
import { CapabilityGate } from "./CapabilityGate";

export function MemoryPanel({
  configApplies,
  browseAvailable
}: {
  configApplies: boolean;
  browseAvailable: boolean;
}) {
  const { config, update } = useTokenReductionConfig();
  const c = config.ccr ?? {};
  const set = (patch: Partial<NonNullable<typeof config.ccr>>) =>
    void update({ ...config, ccr: { ...c, ...patch } });

  return (
    <div className="cache-panel">
      <section className="cache-panel__telemetry">
        <h2>CCR store</h2>
        <CapabilityGate capability="ccr.browse.v1" available={browseAvailable}>
          <div className="token-reduction__placeholder">
            Paged-out entries, full-content view, and retrieval hit rate render here.
          </div>
        </CapabilityGate>
      </section>

      <section className="cache-panel__config">
        <h2>Retention</h2>
        {!configApplies ? (
          <p className="cap-gate__msg">
            Saved here and applied once the proxy supports <code>ccr.config.v1</code>.
          </p>
        ) : null}
        <label className="cache-panel__field">
          TTL (seconds)
          <input
            type="number"
            min={0}
            value={c.ttlSeconds ?? 604800}
            onChange={(e) => set({ ttlSeconds: Number(e.target.value) })}
          />
        </label>
        <label className="cache-panel__field">
          Max store size (bytes)
          <input
            type="number"
            min={0}
            value={c.maxStoreBytes ?? 524288000}
            onChange={(e) => set({ maxStoreBytes: Number(e.target.value) })}
          />
        </label>
        <label className="cache-panel__field">
          Eviction policy
          <select
            value={c.evictionPolicy ?? "lrr"}
            onChange={(e) =>
              set({ evictionPolicy: e.target.value as NonNullable<typeof c.evictionPolicy> })
            }
          >
            <option value="lrr">Least-recently-retrieved</option>
            <option value="lru">Least-recently-used</option>
            <option value="fifo">First-in-first-out</option>
          </select>
        </label>
      </section>
    </div>
  );
}
