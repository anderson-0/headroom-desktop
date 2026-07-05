import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { PxpipeStatus } from "../../lib/tokenReductionContracts";
import { useTokenReductionConfig } from "../../lib/tokenReductionConfig";

// pxpipe imaging (plan 06). `available` = the imaging.local.v1 capability (Node
// present). The toggle drives the whole enable/disable flow in one backend call
// (persist config, start/stop sidecar, restart the proxy), so we don't persist
// via useTokenReductionConfig here — set_imaging_enabled already did.
export function ImagingPanel({ available }: { available: boolean }) {
  const { config, loaded } = useTokenReductionConfig();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<PxpipeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) setEnabled(config.imaging?.enabled ?? false);
  }, [loaded, config.imaging?.enabled]);

  useEffect(() => {
    if (!available) return;
    invoke<PxpipeStatus>("pxpipe_status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [available]);

  if (!available) {
    return (
      <p className="cap-gate__msg">
        Requires Node.js and the pxpipe engine. Install Node.js (which provides{" "}
        <code>npx</code>) and this feature lights up automatically.
      </p>
    );
  }

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    setEnabled(next); // optimistic
    try {
      const s = await invoke<PxpipeStatus>("set_imaging_enabled", { enabled: next });
      setStatus(s);
    } catch (err) {
      setEnabled(!next); // revert
      setError(typeof err === "string" ? err : "Could not apply imaging change.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cache-panel__config">
      <label className="cache-panel__field">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Enable pxpipe imaging (render bulky context as dense images)
      </label>

      {busy ? (
        <p className="token-reduction__blurb">Applying — the proxy restarts to pick up the change…</p>
      ) : null}

      {error ? <p className="cache-panel__warning">{error}</p> : null}

      {status ? (
        <p className="token-reduction__blurb">
          Sidecar:{" "}
          {status.running
            ? status.healthy
              ? `healthy on port ${status.port}`
              : "starting…"
            : "stopped"}
        </p>
      ) : null}
    </div>
  );
}
