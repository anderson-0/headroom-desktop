# Plan 06 — pxpipe imaging as a toggleable Token Reduction plugin

Add pxpipe (text-context-as-images token reduction) to headroom-desktop as an
optional capability inside the existing **Token Reduction** suite, enabled and
disabled from a toggle. This plan fits pxpipe into the scaffold already in the
tree (`token_reduction.rs`, `tokenReductionContracts.ts`,
`components/TokenReduction/`), not a parallel system.

- Upstream: `teamchong/pxpipe` (npm `pxpipe-proxy`), **MIT**, pure-JS renderer,
  sole runtime dep `gpt-tokenizer`. Runs on Node and Cloudflare Workers.
- Integration decided: **Node sidecar via npm dep** (not a fork, not a port).
- Host decided: **headroom-desktop (Tauri/Rust)**.

---

## 1. The one architectural wrinkle: a desktop-managed engine

The existing suite assumes *"engines live in the proxy; this module only
persists config and probes capabilities"* (`token_reduction.rs` header). Every
current capability (`cache`, `routing`, `pruning`, `ccr`) is gated on the
**proxy** reporting support via `get_token_reduction_capabilities` →
`CapabilityGate`.

pxpipe breaks that assumption: it is a **JS engine the desktop manages**, not
something the Rust/Python proxy provides. That's fine — it just means the gate
is a **local-runtime probe** (is Node present + is the pxpipe sidecar
installed/running?), not a proxy capability. Everything else (config file, UI
tab, toggle) reuses the existing pattern unchanged.

Concretely:
- Config still lives in `token-reduction-config.json` under a new `imaging` key.
- The tab still lives in `TokenReductionView`.
- The gate becomes `imaging.local.v1` — reported by a new Rust probe that checks
  the Node runtime + sidecar, instead of by the proxy.

---

## 2. Where pxpipe sits in the request pipeline

Current pipeline (`proxy_intercept.rs:3`, `:135`, `:403`):

```
Claude Code ──▶ 127.0.0.1:6767  ──▶ 127.0.0.1:6768 ──▶ https://api.anthropic.com
                (Rust intercept)     (Python backend)    (ANTHROPIC_DIRECT_BASE)
                capture/route        headroom compress   upstream_base
```

pxpipe images the *request*, so it must run **last, closest to the model** — on
whatever text headroom's own reductions leave behind. Insert the sidecar as the
upstream both forward paths point at, when imaging is on:

```
… ──▶ 6768 (Python) ──▶ 127.0.0.1:<pxpipe> ──▶ https://api.anthropic.com
                         (pxpipe sidecar)        (pxpipe's own upstream, default)
```

The lever is the upstream target, in two places:
- **Backend path:** the Python backend's upstream (the base URL it forwards to).
  When imaging is on, point it at the pxpipe sidecar instead of Anthropic. This
  is an env the backend already honours (`ANTHROPIC_BASE_URL`-style) set by
  `tool_manager` at spawn.
- **Direct/bypass paths:** `forward_direct_to_anthropic(client, buf, upstream_base)`
  uses `upstream_base` (`proxy_intercept.rs:151`, `:403`, `:412`, `:421`, `:455`).
  When imaging is on, set `upstream_base` to the pxpipe sidecar URL instead of
  `ANTHROPIC_DIRECT_BASE`.

pxpipe then transforms and forwards to `https://api.anthropic.com` (its
`ProxyConfig.upstream` default; `pxpipe/src/core/proxy.ts:468`).

> Ordering rationale: putting pxpipe *before* 6767 would hand headroom
> already-imaged requests it can't read, measure, or compress. Last-hop keeps
> both layers working and composable.

---

## 3. Components to add

### 3a. Rust — sidecar lifecycle (`src-tauri/src/pxpipe.rs`, new)

Mirror the Python backend lifecycle in `tool_manager.rs`
(`start_headroom_background` at `:740`, the pre-flight port checks, stop, health
probe). Responsibilities:

- **Spawn** the sidecar: `node <managed>/pxpipe/dist/node.js` (or the package
  bin) with env:
  - `PXPIPE_CONFIG=<app_data>/pxpipe-config.json` (headroom writes this; see 3d)
  - listen port = chosen via a port module (see 3b)
  - upstream = `https://api.anthropic.com`
- **Health**: probe the sidecar's `/` (dashboard) or a `readyz` before flipping
  upstreams — same "don't route until healthy" discipline as the backend.
- **Stop**: on disable and on app exit (add to the exit teardown in `lib.rs`
  alongside `stop_headroom()`).
- **Install/update**: `npm i pxpipe-proxy@<pinned>` into a managed dir at
  enable-time, pinned like `HEADROOM_PINNED_WHEEL_URL` (`tool_manager.rs:40`).
  Vendoring `dist/` in-tree is the offline alternative (see 5).

### 3b. Rust — sidecar port (`src-tauri/src/pxpipe_port.rs`, new)

Copy `backend_port.rs` verbatim in shape: a default port (pxpipe's own is
`47821`), a fallback range, `select_available` probe, a global setter. Keeps the
"something already grabbed the port" handling headroom already learned the hard
way (`backend_port.rs:4`).

### 3c. Rust — upstream flip (`proxy_intercept.rs`)

`upstream_base` is currently a fixed `Arc<String>` (`:151`). Make it read the
imaging state: when `imaging.enabled` and the sidecar is healthy, initialise it
to the sidecar URL; otherwise `ANTHROPIC_DIRECT_BASE`. For the backend path, set
the backend's upstream env in `tool_manager` at spawn based on the same flag.
Toggling at runtime = restart the two forward targets (simplest: re-spawn
backend with the new upstream env, reset `upstream_base`). A live-swap
`ArcSwap<String>` is a later optimisation — **ponytail: restart-to-apply is
fine for v1**, the toggle is not hot-path.

### 3d. Config contract (`tokenReductionContracts.ts` + a pxpipe config writer)

Add to `TokenReductionConfig`:

```ts
imaging?: {
  enabled?: boolean;
  models?: string[];          // which model ids to image (default: Fable only)
  opusOptIn?: boolean;        // Opus misreads imaged content — default false
  minCharsToImage?: number;   // don't image small blocks
  // pxpipe-native knobs pass through to pxpipe-config.json
};
```

Add capability key `"imaging.local.v1"` to the `Capability` union.

Two config files, one source of truth:
- `token-reduction-config.json` (`imaging` section) — the desktop UI writes it,
  same as today via `set_token_reduction_config`.
- `pxpipe-config.json` (`PXPIPE_CONFIG`) — headroom **derives** this from the
  `imaging` section when enabling, so users configure one place. Do not expose
  pxpipe's file directly.

### 3e. UI — `components/TokenReduction/ImagingPanel.tsx` (new) + a tab

Add a sixth entry to `TABS` in `TokenReduction/index.tsx`:

```ts
{ id: "imaging", label: "Imaging", capability: "imaging.local.v1",
  blurb: "Render bulky context as dense images to cut input tokens (pxpipe)." }
```

`ImagingPanel` gets the **enable toggle** as its primary control, plus the
`imaging` knobs, wired through the existing `useTokenReductionConfig()` hook. Gate
it with `CapabilityGate capability="imaging.local.v1"`, where `available` comes
from the new local probe — the gate message should say *"Requires Node.js and
the pxpipe engine"* rather than *"Requires a Headroom proxy…"* (the component
takes the message as a prop, or a variant, so we don't fabricate a proxy
dependency).

### 3f. Local-runtime probe (`token_reduction.rs`)

`get_token_reduction_capabilities` currently returns `Vec::new()`. Add a
desktop-side check that appends `"imaging.local.v1"` when Node is on PATH (or a
bundled Node exists) and the pxpipe sidecar is installed. Mirror
`python_runtime_installed()` (`tool_manager.rs:590`).

---

## 4. Enable / disable flow

```
enable:
  1. probe Node runtime → if absent, surface "install Node" (gate stays closed)
  2. ensure pxpipe installed (npm i pinned, or vendored dist present)
  3. write pxpipe-config.json from the imaging section
  4. select_available sidecar port; spawn sidecar; wait healthy
  5. flip upstreams (backend env + upstream_base) to the sidecar
  6. persist imaging.enabled=true

disable:
  1. flip upstreams back to ANTHROPIC_DIRECT_BASE / backend→Anthropic
  2. stop the sidecar
  3. persist imaging.enabled=false
```

pxpipe transforms the **request only** and already has a kill switch and
self-measurement against a `count_tokens` counterfactual — so "off" is a true
pass-through, and savings are attributable without trusting our own math.

---

## 5. Node runtime — the real prerequisite

headroom bundles Python, not Node. Decide how the sidecar gets a Node:

- **v1 (lazy): require system Node.** Probe `node`/`npx`; gate the feature off
  with a clear message if absent. Least code, ships now. Most target users
  (Claude Code devs) have Node.
- **Later: bundle a Node runtime** the way Python is bundled
  (`tool_manager.rs` runtime dir), for a zero-prereq experience. Bigger download,
  more build surface. Only if the gate proves too common.

Install strategy for pxpipe itself, pick one:
- `npm i pxpipe-proxy@<pinned>` into a managed dir at enable-time (needs network
  first run; pin the version — do not float `@latest` in a shipped app).
- **Vendor `dist/`** in-tree for offline/pinned/deterministic builds (still runs
  under system Node). Preferred if you want reproducible installs.

---

## 6. Licensing

MIT. Keep pxpipe's `LICENSE`/copyright in whatever you ship (bundled `dist/`, a
`NOTICE`, or the npm dep's own license). No copyleft, no attribution beyond the
notice. If you vendor and modify, note the modification.

---

## 7. Risks & decisions

- **Double compression order** — pxpipe must be last hop (§2). Verify headroom's
  compressed output still parses as valid `/v1/messages` for pxpipe to image.
- **Model support** — pxpipe reads imaged text well on Fable (100/100) but Opus
  misreads it; default `models` to Fable, `opusOptIn=false`. This matches
  pxpipe's own opt-in-Opus stance.
- **Streaming** — pxpipe compresses the request, streams the response
  unchanged; headroom already streams. No response-path change.
- **Two dashboards** — pxpipe serves its own dashboard on the sidecar port.
  Either hide it (bind loopback, don't surface) or link to it from ImagingPanel.
  Don't rebuild its telemetry; read pxpipe's `~/.pxpipe/events.jsonl` /
  `measurement` export if you want savings in headroom's own graphs.
- **Runtime toggle cost** — v1 restarts forward targets to apply. Acceptable;
  revisit with `ArcSwap` only if users toggle often.

---

## 8. Phased implementation

1. **Sidecar spawn + port** (`pxpipe.rs`, `pxpipe_port.rs`) — spawn a pinned
   pxpipe under system Node, health-probe, stop on exit. No routing yet.
   Check: sidecar answers on its port; killed on app quit.
2. **Upstream flip** (`proxy_intercept.rs`, `tool_manager` backend env) behind a
   hardcoded flag. Check: with flag on, a real request round-trips through
   pxpipe (verify via pxpipe's events.jsonl) and the response is intact.
3. **Config + probe** (`token_reduction.rs`, `tokenReductionContracts.ts`,
   derive `pxpipe-config.json`). Check: `imaging.local.v1` appears only when Node
   + pxpipe present; config round-trips.
4. **UI** (`ImagingPanel.tsx` + tab + gate variant). Check: toggle enables/disables
   end to end; gate shows the Node/pxpipe message when unavailable.
5. **Polish** — pinned-version install or vendored `dist/`, license notice,
   dashboard link, savings ingestion.

Each phase leaves a runnable check; land them behind the disabled-by-default
toggle so partial work never affects normal traffic.

---

## 9. Test plan

- **Rust:** `cargo test --manifest-path src-tauri/Cargo.toml --lib pxpipe` for the
  port/lifecycle module (mirror `backend_port.rs` tests); `cargo check` for the
  `proxy_intercept` upstream change.
- **Frontend:** `npx tsc --noEmit` + a Vitest for the `imaging` config
  round-trip and the derive-to-`pxpipe-config.json` mapping.
- **Manual (per `/verify`):** enable the toggle, run a real Claude Code session
  through 6767, confirm (a) pxpipe's `events.jsonl` shows transforms, (b)
  responses stream normally, (c) disabling restores direct-to-Anthropic (no
  sidecar in path), (d) with Node absent the tab shows the gate, not a crash.
```
