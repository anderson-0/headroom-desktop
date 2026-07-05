//! Optional pxpipe imaging sidecar: a Node process (`pxpipe-proxy`) that renders
//! bulky request context as dense images to cut input tokens. Managed like the
//! Python backend — locate runtime, spawn, health-probe, stop. This is Phase 1:
//! lifecycle only. Wiring it into the request pipeline (the upstream flip) and
//! the config/UI land in later phases. See docs/plans/06-pxpipe-imaging.md.
//!
//! pxpipe is MIT (teamchong/pxpipe, npm `pxpipe-proxy`).

use std::net::{SocketAddr, TcpListener, TcpStream};
use std::os::unix::process::CommandExt; // matches tool_manager.rs; unix-only, like the rest of the spawn path
use std::path::{Path, PathBuf};
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

/// First existing `name` across `PATH`. `exists` is injected so tests don't touch
/// the real filesystem.
fn locate_executable(
    name: &str,
    path_var: &str,
    exists: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    for dir in std::env::split_paths(path_var) {
        let candidate = dir.join(name);
        if exists(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn locate_npx() -> Option<PathBuf> {
    let path = std::env::var("PATH").unwrap_or_default();
    locate_executable("npx", &path, |p| p.exists())
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

#[tauri::command]
pub fn pxpipe_start(state: State<'_, PxpipeState>) -> Result<u16, String> {
    start(&state)
}

#[tauri::command]
pub fn pxpipe_stop(state: State<'_, PxpipeState>) {
    stop(&state);
}

#[tauri::command]
pub fn pxpipe_status(state: State<'_, PxpipeState>) -> PxpipeStatus {
    let running = state.0.lock().map(|g| g.is_some()).unwrap_or(false);
    let port = pxpipe_port::get();
    PxpipeStatus {
        running,
        healthy: running && sidecar_healthy(port),
        port,
        node_available: locate_npx().is_some(),
    }
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
    fn locate_executable_returns_first_hit_on_path() {
        let path = "/usr/local/bin:/opt/homebrew/bin:/usr/bin";
        // Only /opt/homebrew/bin/npx "exists".
        let found = locate_executable("npx", path, |p| {
            p == Path::new("/opt/homebrew/bin/npx")
        });
        assert_eq!(found, Some(PathBuf::from("/opt/homebrew/bin/npx")));
    }

    #[test]
    fn locate_executable_none_when_absent() {
        assert_eq!(
            locate_executable("npx", "/usr/bin:/bin", |_| false),
            None
        );
    }
}
