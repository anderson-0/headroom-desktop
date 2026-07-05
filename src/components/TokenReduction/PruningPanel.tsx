import { useTokenReductionConfig } from "../../lib/tokenReductionConfig";
import { CapabilityGate } from "./CapabilityGate";

// Tiers from research/token-reduction-survey.md §3.1.
function tierLabel(ratio: number): string {
  if (ratio <= 3) return "light (~<5% accuracy loss)";
  if (ratio <= 7) return "moderate (~5–15% accuracy loss)";
  return "aggressive (accuracy risk)";
}

export function PruningPanel({
  configApplies,
  telemetryAvailable
}: {
  configApplies: boolean;
  telemetryAvailable: boolean;
}) {
  const { config, update } = useTokenReductionConfig();
  const p = config.pruning ?? {};
  const set = (patch: Partial<NonNullable<typeof config.pruning>>) =>
    void update({ ...config, pruning: { ...p, ...patch } });

  const ratio = p.maxRatio ?? 3;

  return (
    <div className="cache-panel">
      <section className="cache-panel__config">
        <h2>Configuration</h2>
        {!configApplies ? (
          <p className="cap-gate__msg">
            Saved here and applied once the proxy supports <code>pruning.config.v1</code>.
          </p>
        ) : null}
        <label className="cache-panel__field">
          <input
            type="checkbox"
            checked={p.enabled ?? false}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Enable question-aware pruning
        </label>
        <label className="cache-panel__field">
          Max compression ratio: {ratio}x — {tierLabel(ratio)}
          <input
            type="range"
            min={2}
            max={10}
            step={1}
            value={ratio}
            onChange={(e) => set({ maxRatio: Number(e.target.value) })}
          />
        </label>
        <label className="cache-panel__field">
          <input
            type="checkbox"
            checked={p.extractiveOnly ?? true}
            onChange={(e) => {
              // Extractive is safer (improves accuracy by filtering noise); abstractive
              // can paraphrase-error. Confirm before allowing abstractive.
              if (p.extractiveOnly !== false && !e.target.checked) {
                const ok = window.confirm(
                  "Abstractive pruning can introduce paraphrase errors and lose context. Allow it?"
                );
                if (!ok) return;
              }
              set({ extractiveOnly: e.target.checked });
            }}
          />
          Extractive only (recommended)
        </label>
      </section>

      <section className="cache-panel__telemetry" style={{ marginTop: 16 }}>
        <h2>Pruning impact</h2>
        <CapabilityGate capability="pruning.stats.v1" available={telemetryAvailable}>
          <div className="token-reduction__placeholder">
            Extra tokens saved and realized-ratio distribution render here.
          </div>
        </CapabilityGate>
        <p className="token-reduction__blurb" style={{ marginTop: 8 }}>
          Watch the Thrashing tab — a rising re-read rate means pruning is too
          aggressive.
        </p>
      </section>
    </div>
  );
}
