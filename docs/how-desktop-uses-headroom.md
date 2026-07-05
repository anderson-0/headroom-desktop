# How headroom-desktop uses headroom (the Python package)

Reference note. headroom-desktop and `headroom` (upstream Python, published as
`headroom-ai`) are **two separate repositories**. headroom-desktop does **not**
consume headroom's source — it consumes the **published PyPI wheel**, bundles
its own Python runtime, installs the wheel into it, and runs headroom's CLI as a
subprocess. The coupling is at the packaged-artifact level, pinned to an exact
version.

Everything below is in `src-tauri/src/tool_manager.rs` unless noted.

---

## 1. Pinned wheel, not source

```
const HEADROOM_PINNED_WHEEL_URL =
  ".../headroom_ai-0.30.0-cp310-abi3-macosx_11_0_arm64.whl"   // tool_manager.rs:40
```

- An exact `headroom-ai` version is pinned. Auto-upgrade is deliberately
  disabled; adopting a new upstream release means editing this constant (and the
  per-platform variants) and re-shipping.
- A floor-version guard exists to avoid stale native extensions (`headroom_core`)
  from pip's in-place upgrades — see the long comment block around lines 116-198.

## 2. Bundled Python + pip install

- headroom-desktop ships/manages its own **standalone Python runtime**: a
  `python_dir` plus a venv (`runtime.venv_dir`). It does not use system Python.
- At bootstrap it `pip install`s the pinned `headroom-ai` wheel plus a locked
  requirements file (`python/headroom-requirements.lock`, embedded via
  `include_str!` at `tool_manager.rs:91`).
- Sources for pip: a vendor-wheels GitHub release consumed via `--find-links`
  (`VENDOR_WHEELS_* ` expanded_assets URL, `tool_manager.rs:59`) plus PyPI simple
  (`--find-links ... https://pypi.org/simple`, e.g. `:1676`, `:2048`).
- So `headroom` lives **inside the app's managed venv**, isolated from anything
  on the machine.

## 3. It runs headroom's CLI as the backend

Installing `headroom-ai` provides a `headroom` console script:

```
headroom_entrypoint() = runtime.venv_dir/bin/headroom      // tool_manager.rs:598
```

The desktop spawns it as a child process (`start_headroom_background`, `:740`;
spawn site ~`:897`):

```
nice -n 2 <venv>/bin/headroom proxy --port <6768> --no-http2 --log-messages [learn args…]
```

- Args come from `headroom_entrypoint_startup_args()` (`:4572`): `proxy`,
  `--port <backend port>`, conditionally `--no-http2`, `--log-messages`, plus
  `headroom learn` args.
- `--log-messages` persists full request/response bodies so the desktop Activity
  tab can render the live transformations feed.
- Spawn env includes `HEADROOM_SDK=headroom-desktop-proxy`,
  `HEADROOM_TELEMETRY=on`, `HEADROOM_HTTP2=false`, plus a `PYTHONPATH` inject dir
  holding only a `sitecustomize.py` (`:917` and nearby).

## 4. Where it sits in the request pipeline

The `headroom proxy` process is the **Python backend on port 6768** — the actual
token-reduction / compression engine. The Rust intercept proxy (6767) captures
and forwards to it; it forwards to Anthropic.

```
Claude Code
   ─▶ 127.0.0.1:6767   (Rust intercept — headroom-desktop, proxy_intercept.rs)
   ─▶ 127.0.0.1:6768   (headroom proxy — the CLI from headroom-ai)
   ─▶ https://api.anthropic.com
```

- 6768 default lives in `backend_port.rs` (`DEFAULT_BACKEND_PORT`, fallback range
  6769-6790 via `select_available`, because other processes sometimes squat the
  port).
- Health/reachability probes target 6768 (the backend); public stats endpoints
  are on 6767.

## 5. Version relationship

- Desktop version and bundled `headroom-ai` version move independently. History
  of the floor bumps (0.4.0 → 0.20.0, 0.4.x → 0.25/0.26 bundle, current 0.30.0)
  is documented inline at `tool_manager.rs:132-198`.
- Upstream repos: fork `gglucass/headroom`, upstream `chopratejas/headroom`;
  PyPI project `headroom-ai` (`source_url` at `tool_manager.rs:516`).

---

## One-line summary

headroom-desktop is a **Tauri/Rust GUI + intercept proxy** that **bundles a
Python runtime, pip-installs the upstream `headroom-ai` package into it, and runs
`headroom proxy` as its compression backend on 6768**. The two repos are linked
only by the pinned PyPI wheel — not shared source.

## Why this matters for the pxpipe plugin (plan 06)

The pxpipe sidecar mirrors this exact pattern — *install a pinned artifact +
spawn its CLI* — but with npm/Node instead of pip/Python. And because headroom's
own compression **is** the 6768 process, `docs/plans/06-pxpipe-imaging.md` places
pxpipe as the *last* hop after it.
