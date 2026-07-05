//! Optional pxpipe imaging sidecar: a Node process (`pxpipe-proxy`) that renders
//! bulky request context as dense images to cut input tokens. Managed like the
//! Python backend — locate runtime, spawn, health-probe, stop. This is Phase 1:
//! lifecycle only. Wiring it into the request pipeline (the upstream flip) and
//! the config/UI land in later phases. See docs/plans/06-pxpipe-imaging.md.
//!
//! pxpipe is MIT (teamchong/pxpipe, npm `pxpipe-proxy`).

use std::net::{SocketAddr, TcpListener, TcpStream};
use std::os::unix::process::CommandExt; // matches tool_manager.rs; unix-only, like the rest of the spawn path
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::State;

use crate::pxpipe_port;

/// Pinned pxpipe-proxy version. Bump deliberately, mirroring the pinned headroom
/// wheel in tool_manager (see docs/how-desktop-uses-headroom.md). `npx` fetches
/// this exact version on first run.
// ponytail: npx-fetch-on-first-run is the Phase 1 install path; a pinned local
// `npm i` (or vendored dist) is Phase 5. Keep it simple until it bites.
const PXPIPE_PINNED_VERSION: &str = "0.8.0";

/// pxpipe forwards to the real Anthropic API. When the pipeline flip lands
/// (later phase), the intercept points its upstream here instead of Anthropic.
const ANTHROPIC_UPSTREAM: &str = "https://api.anthropic.com";

/// Managed Tauri state: the running sidecar child, if any.
#[derive(Default)]
pub struct PxpipeState(Mutex<Option<Child>>);

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PxpipeStatus {
    pub running: bool,
    pub healthy: bool,
    pub port: u16,
    pub node_available: bool,
}

/// `npx` arguments to launch the pinned sidecar. Pure for testability.
fn spawn_args(version: &str) -> Vec<String> {
    vec!["-y".to_string(), format!("pxpipe-proxy@{version}")]
}

/// Env pxpipe reads (`src/node.ts`): PORT, HOST, ANTHROPIC_UPSTREAM. Env wins over
/// its config file, so we skip writing one in Phase 1. Pure for testability.
fn spawn_env(port: u16, upstream: &str) -> Vec<(&'static str, String)> {
    vec![
        ("PORT", port.to_string()),
        ("HOST", "127.0.0.1".to_string()),
        ("ANTHROPIC_UPSTREAM", upstream.to_string()),
    ]
}

/// Locate `npx`. Delegates to the shared CLI resolver (known paths + login-shell
/// probe) so it finds nvm/fnm/volta/bun Node installs that a Finder-launched
/// app's stripped PATH wouldn't otherwise see.
fn locate_npx() -> Option<PathBuf> {
    crate::claude_cli::detect_npx()
}

fn sidecar_healthy(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
}

/// Start the sidecar if not already running. Returns the chosen port. Idempotent:
/// a second call while running returns the current port without respawning.
pub fn start(state: &PxpipeState) -> Result<u16, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(pxpipe_port::get());
    }

    let npx = locate_npx().ok_or_else(|| {
        "Node.js (npx) not found on PATH. Install Node to use pxpipe imaging.".to_string()
    })?;

    let port = pxpipe_port::select_available(|p| TcpListener::bind(("127.0.0.1", p)).is_ok())
        .ok_or_else(|| "No free port for the pxpipe sidecar.".to_string())?;

    let child = Command::new(&npx)
        .args(spawn_args(PXPIPE_PINNED_VERSION))
        .envs(spawn_env(port, ANTHROPIC_UPSTREAM))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        // Own process group so stop() can kill npx AND the node child it wraps.
        .process_group(0)
        .spawn()
        .map_err(|e| format!("spawn pxpipe sidecar: {e}"))?;

    log::info!("pxpipe: sidecar started on 127.0.0.1:{port} (npx {npx:?})");
    *guard = Some(child);
    Ok(port)
}

/// Stop the sidecar if running. Kills the whole process group: `npx` wraps the
/// real node process, so a bare `child.kill()` would orphan it.
pub fn stop(state: &PxpipeState) {
    let Ok(mut guard) = state.0.lock() else {
        return;
    };
    if let Some(mut child) = guard.take() {
        let pgid = child.id() as i32; // process_group(0) → pgid == leader pid
        // SAFETY: kill(2) with a negative pid signals the process group. Harmless
        // if the group is already gone (returns ESRCH, ignored).
        unsafe {
            libc::kill(-pgid, libc::SIGTERM);
        }
        let _ = child.kill();
        let _ = child.wait();
        log::info!("pxpipe: sidecar stopped");
    }
}

/// Gate for the upstream flip: the `imaging.enabled` key in
/// token-reduction-config.json (plan 06 phase 3). The `HEADROOM_PXPIPE_IMAGING`
/// env var forces it on for dev/testing without touching the config file.
pub fn imaging_enabled() -> bool {
    crate::token_reduction::read_imaging_enabled()
        || matches!(
            std::env::var("HEADROOM_PXPIPE_IMAGING").ok().as_deref(),
            Some("1") | Some("true") | Some("yes")
        )
}

/// Whether the Node runtime (npx) is on PATH — the prerequisite for the pxpipe
/// sidecar. Drives the `imaging.local.v1` capability.
pub fn node_available() -> bool {
    locate_npx().is_some()
}

fn sidecar_upstream_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

/// Env for the headroom backend so it forwards to the pxpipe sidecar instead of
/// Anthropic (headroom reads `ANTHROPIC_TARGET_API_URL`). Pxpipe then forwards to
/// the real Anthropic — putting pxpipe last, closest to the model.
///
/// Returns empty unless imaging is on AND the sidecar is healthy: never point
/// headroom at a dead port, or all traffic breaks. When empty, headroom keeps its
/// built-in upstream and imaging is silently a no-op.
fn backend_upstream_env_for(
    enabled: bool,
    healthy: bool,
    port: u16,
) -> Vec<(&'static str, String)> {
    if enabled && healthy {
        vec![("ANTHROPIC_TARGET_API_URL", sidecar_upstream_url(port))]
    } else {
        Vec::new()
    }
}

pub fn backend_upstream_env() -> Vec<(&'static str, String)> {
    let port = pxpipe_port::get();
    backend_upstream_env_for(imaging_enabled(), sidecar_healthy(port), port)
}

/// Direct/bypass-path upstream for the Rust intercept: pxpipe when imaging is on
/// and healthy, else the passed-through Anthropic base. Same safety rule as
/// [`backend_upstream_env`].
fn resolve_direct_upstream_for(enabled: bool, healthy: bool, port: u16, fallback: &str) -> String {
    if enabled && healthy {
        sidecar_upstream_url(port)
    } else {
        fallback.to_string()
    }
}

pub fn resolve_direct_upstream(fallback: &str) -> String {
    let port = pxpipe_port::get();
    resolve_direct_upstream_for(imaging_enabled(), sidecar_healthy(port), port, fallback)
}

#[tauri::command]
pub fn pxpipe_start(state: State<'_, PxpipeState>) -> Result<u16, String> {
    start(&state)
}

#[tauri::command]
pub fn pxpipe_stop(state: State<'_, PxpipeState>) {
    stop(&state);
}

/// Poll until the sidecar answers on `port`, or `timeout` elapses.
pub fn wait_healthy(port: u16, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if sidecar_healthy(port) {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

pub fn status(state: &PxpipeState) -> PxpipeStatus {
    let running = state.0.lock().map(|g| g.is_some()).unwrap_or(false);
    let port = pxpipe_port::get();
    PxpipeStatus {
        running,
        healthy: running && sidecar_healthy(port),
        port,
        node_available: node_available(),
    }
}

#[tauri::command]
pub fn pxpipe_status(state: State<'_, PxpipeState>) -> PxpipeStatus {
    status(&state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_args_pins_version() {
        assert_eq!(
            spawn_args("0.8.0"),
            vec!["-y".to_string(), "pxpipe-proxy@0.8.0".to_string()]
        );
    }

    #[test]
    fn spawn_env_sets_port_host_upstream() {
        let env = spawn_env(47821, "https://api.anthropic.com");
        assert!(env.contains(&("PORT", "47821".to_string())));
        assert!(env.contains(&("HOST", "127.0.0.1".to_string())));
        assert!(env.contains(&("ANTHROPIC_UPSTREAM", "https://api.anthropic.com".to_string())));
    }

    #[test]
    fn backend_upstream_env_injects_only_when_enabled_and_healthy() {
        assert_eq!(
            backend_upstream_env_for(true, true, 47821),
            vec![(
                "ANTHROPIC_TARGET_API_URL",
                "http://127.0.0.1:47821".to_string()
            )]
        );
        // Enabled but sidecar down: no injection (don't brick traffic).
        assert!(backend_upstream_env_for(true, false, 47821).is_empty());
        // Disabled: no injection regardless of health.
        assert!(backend_upstream_env_for(false, true, 47821).is_empty());
    }

    #[test]
    fn resolve_direct_upstream_flips_only_when_enabled_and_healthy() {
        let anthropic = "https://api.anthropic.com";
        assert_eq!(
            resolve_direct_upstream_for(true, true, 47821, anthropic),
            "http://127.0.0.1:47821"
        );
        assert_eq!(
            resolve_direct_upstream_for(true, false, 47821, anthropic),
            anthropic
        );
        assert_eq!(
            resolve_direct_upstream_for(false, true, 47821, anthropic),
            anthropic
        );
    }

    // Manual smoke test of the real spawn/health/stop path. Needs Node (npx) on
    // PATH and network (first-run npx fetch of pxpipe-proxy). Not run in CI.
    //   cargo test --manifest-path src-tauri/Cargo.toml --lib \
    //     pxpipe::tests::smoke_start_health_stop -- --ignored --nocapture
    #[test]
    #[ignore]
    fn smoke_start_health_stop() {
        let state = PxpipeState::default();

        let port = start(&state).expect("start sidecar");
        assert_eq!(port, pxpipe_port::get());

        // First run downloads the package; poll health generously.
        let mut healthy = false;
        for _ in 0..120 {
            if sidecar_healthy(port) {
                healthy = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        assert!(healthy, "sidecar never became healthy on port {port}");

        stop(&state);

        // Port should free up shortly after the group is killed.
        let mut freed = false;
        for _ in 0..20 {
            if TcpListener::bind(("127.0.0.1", port)).is_ok() {
                freed = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        assert!(freed, "port {port} still held after stop");
    }
}
