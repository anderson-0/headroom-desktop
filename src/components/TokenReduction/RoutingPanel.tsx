import { useTokenReductionConfig } from "../../lib/tokenReductionConfig";
import { CapabilityGate } from "./CapabilityGate";

export function RoutingPanel({
  configApplies,
  telemetryAvailable
}: {
  configApplies: boolean;
  telemetryAvailable: boolean;
}) {
  const { config, update } = useTokenReductionConfig();
  const r = config.routing ?? {};
  const set = (patch: Partial<NonNullable<typeof config.routing>>) =>
    void update({ ...config, routing: { ...r, ...patch } });

  const ladderStr = (r.ladder ?? []).map((l) => l.model).join(", ");

  return (
    <div className="cache-panel">
      <section className="cache-panel__config">
        <h2>Configuration</h2>
        {!configApplies ? (
          <p className="cap-gate__msg">
            Saved here and applied once the proxy supports <code>routing.config.v1</code>.
          </p>
        ) : null}
        <label className="cache-panel__field">
          Mode
          <select
            value={r.mode ?? "off"}
            onChange={(e) => set({ mode: e.target.value as NonNullable<typeof r.mode> })}
          >
            <option value="off">Off</option>
            <option value="pure-router">Pure router</option>
            <option value="cascade">Confidence cascade</option>
          </select>
        </label>
        <label className="cache-panel__field">
          Model ladder (cheap → strong, comma-separated)
          <input
            type="text"
            value={ladderStr}
            onChange={(e) =>
              set({
                ladder: e.target.value
                  .split(",")
                  .map((m) => m.trim())
                  .filter(Boolean)
                  .map((model) => ({ model }))
              })
            }
          />
        </label>
        <label className="cache-panel__field">
          Complexity threshold
          <input
            type="number"
            step={0.01}
            min={0}
            max={1}
            value={r.complexityThreshold ?? 0.5}
            onChange={(e) => set({ complexityThreshold: Number(e.target.value) })}
          />
        </label>
        <label className="cache-panel__field">
          Confidence threshold (cascade)
          <input
            type="number"
            step={0.01}
            min={0}
            max={1}
            value={r.confidenceThreshold ?? 0.7}
            onChange={(e) => set({ confidenceThreshold: Number(e.target.value) })}
          />
        </label>
        <label className="cache-panel__field">
          Max escalation depth
          <input
            type="number"
            min={1}
            value={r.maxEscalationDepth ?? 2}
            onChange={(e) => set({ maxEscalationDepth: Number(e.target.value) })}
          />
        </label>
      </section>

      <section className="cache-panel__telemetry" style={{ marginTop: 16 }}>
        <h2>Routing decisions</h2>
        <CapabilityGate capability="routing.decisions.v1" available={telemetryAvailable}>
          <div className="token-reduction__placeholder">
            Per-model distribution, $ saved, and escalation rate render here.
          </div>
        </CapabilityGate>
      </section>
    </div>
  );
}
