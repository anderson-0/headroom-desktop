import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { TransformationFeedResponse } from "../../lib/types";
import { thrashEvents, thrashRate } from "../../lib/thrashSignal";
import { workspaceBasename } from "../ActivityFeed";

const FEED_LIMIT = 100;
const DEFAULT_THRESHOLD = 0.1;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Surfaces the proxy's re-read signal as a thrash rate over the fetched feed window.
// Rising rate after aggressive compaction/pruning = context is being dropped and
// re-fetched (the #1 compaction failure). No --log-messages needed.
export function ThrashingPanel() {
  const [feed, setFeed] = useState<TransformationFeedResponse | null>(null);
  const [project, setProject] = useState("all");
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  useEffect(() => {
    invoke<TransformationFeedResponse>("get_transformations_feed", { limit: FEED_LIMIT })
      .then(setFeed)
      .catch(() => setFeed(null));
  }, []);

  const events = useMemo(() => feed?.transformations ?? [], [feed]);

  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) {
      if (e.workspace) seen.set(e.workspace, workspaceBasename(e.workspace) ?? e.workspace);
    }
    return [...seen.entries()].map(([path, label]) => ({ path, label }));
  }, [events]);

  const filtered = project === "all" ? events : events.filter((e) => e.workspace === project);
  const rate = thrashRate(filtered);
  const flagged = thrashEvents(filtered);
  const over = rate !== null && rate > threshold;

  return (
    <div className="thrashing-panel">
      <div className="compaction-history__controls">
        <label className="compaction-history__filter">
          Project
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="compaction-history__filter">
          Alert above
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(threshold * 100)}
            onChange={(e) => setThreshold(Number(e.target.value) / 100)}
          />
          %
        </label>
      </div>

      {over ? (
        <p className="cache-panel__warning">
          Thrash rate {pct(rate!)} is above your {pct(threshold)} threshold —
          compacted content is being re-read. Consider easing compaction/pruning.
        </p>
      ) : null}

      <dl className="cache-panel__stats">
        <div>
          <dt>Thrash rate</dt>
          <dd>{rate === null ? "—" : pct(rate)}</dd>
        </div>
        <div>
          <dt>Re-read events</dt>
          <dd>
            {flagged.length} / {filtered.length}
          </dd>
        </div>
      </dl>

      {flagged.length > 0 ? (
        <ul className="activity-feed__list">
          {flagged.slice(0, 20).map((e, idx) => (
            <li key={e.requestId ?? idx} className="thrashing-panel__event">
              <span>{workspaceBasename(e.workspace) ?? "—"}</span>
              <span>{e.model ?? "—"}</span>
              <span>{e.timestamp ?? ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="token-reduction__blurb">No re-reads detected in this window.</p>
      )}
    </div>
  );
}
