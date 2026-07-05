import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { TransformationFeedResponse } from "../lib/types";
import { TransformationRow, workspaceBasename } from "./ActivityFeed";

const FEED_LIMIT = 100;

// Browseable history of compaction events. Each row reuses TransformationRow,
// which already renders the per-message token estimate table and the diff.
// Pulls the full feed from the proxy (get_transformations_feed) and filters
// client-side by project (workspace) — no extra backend call.
export function CompactionHistory() {
  const [feed, setFeed] = useState<TransformationFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<string>("all");

  async function refresh() {
    try {
      const res = await invoke<TransformationFeedResponse>("get_transformations_feed", {
        limit: FEED_LIMIT
      });
      setFeed(res);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const events = feed?.transformations ?? [];

  // Distinct projects by full workspace path, labelled by basename.
  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) {
      if (e.workspace) {
        seen.set(e.workspace, workspaceBasename(e.workspace) ?? e.workspace);
      }
    }
    return [...seen.entries()]
      .map(([path, label]) => ({ path, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events]);

  const filtered =
    project === "all" ? events : events.filter((e) => e.workspace === project);

  return (
    <section className="compaction-history">
      <header className="compaction-history__header">
        <h2 className="compaction-history__title">Compaction history</h2>
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
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <p className="compaction-history__hint">Could not load feed: {error}</p>
      ) : feed && !feed.proxyReachable ? (
        <p className="compaction-history__hint">Proxy is not reachable.</p>
      ) : feed && !feed.logFullMessages ? (
        <p className="compaction-history__hint">
          Per-message inspection needs the proxy running with{" "}
          <code>--log-messages</code>. Token totals still show below.
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="compaction-history__hint">No compaction events yet.</p>
      ) : (
        <ul className="activity-feed__list">
          {filtered.map((event, idx) => (
            <TransformationRow key={event.requestId ?? idx} event={event} />
          ))}
        </ul>
      )}
    </section>
  );
}
