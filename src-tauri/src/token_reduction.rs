//! Desktop side of the Token Reduction suite: read/write the proxy-read config
//! file and report which proxy capabilities are available. Engines live in the
//! proxy; this module only persists config and probes capabilities.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::storage::{app_data_dir, config_file};

const CONFIG_FILE: &str = "token-reduction-config.json";

fn config_path() -> PathBuf {
    config_file(&app_data_dir(), CONFIG_FILE)
}

fn read_config_at(path: &Path) -> Result<Value, String> {
    match std::fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|e| format!("parse token-reduction config: {e}"))
        }
        // Missing file is the normal first-run state, not an error.
        Err(_) => Ok(serde_json::json!({})),
    }
}

fn write_config_at(path: &Path, config: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create config dir {}: {e}", parent.display()))?;
    }
    let bytes = serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| format!("write token-reduction config: {e}"))
}

#[tauri::command]
pub fn get_token_reduction_config() -> Result<Value, String> {
    read_config_at(&config_path())
}

#[tauri::command]
pub fn set_token_reduction_config(config: Value) -> Result<(), String> {
    write_config_at(&config_path(), &config)
}

/// Current prefix-cache token totals from the proxy. Real data today (the proxy
/// `/stats` already reports `prefix_cache.totals`); `None` when the proxy is
/// unreachable or predates the field. Drives the cache telemetry panel.
#[tauri::command]
pub fn get_cache_stats() -> Option<crate::state::CacheStats> {
    crate::state::fetch_cache_stats()
}

/// Which token-reduction capabilities are available.
//
// Proxy-provided capabilities (cache/routing/pruning/ccr) have no probe endpoint
// yet, so those stay absent and the UI shows "requires proxy" gates. `imaging` is
// different: it's a desktop-managed engine (the pxpipe sidecar, plan 06), so its
// availability is a *local* probe — is Node present? See docs/plans/06-pxpipe-imaging.md.
#[tauri::command]
pub fn get_token_reduction_capabilities() -> Vec<String> {
    local_capabilities(crate::pxpipe::node_available())
}

/// Pure core of the local capability probe, split out for testing.
fn local_capabilities(node_available: bool) -> Vec<String> {
    let mut caps = Vec::new();
    if node_available {
        caps.push("imaging.local.v1".to_string());
    }
    caps
}

/// Read `imaging.enabled` from the token-reduction config. The gate for the
/// pxpipe upstream flip (plan 06 phase 3). Missing file / key ⇒ false.
pub fn read_imaging_enabled() -> bool {
    read_config_at(&config_path())
        .map(|cfg| imaging_enabled_from_value(&cfg))
        .unwrap_or(false)
}

fn imaging_enabled_from_value(cfg: &Value) -> bool {
    cfg.get("imaging")
        .and_then(|imaging| imaging.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_config_reads_as_empty_object() {
        let path = std::env::temp_dir().join("hr-tr-missing-xyz.json");
        let _ = std::fs::remove_file(&path);
        assert_eq!(read_config_at(&path).unwrap(), serde_json::json!({}));
    }

    #[test]
    fn write_then_read_roundtrips() {
        let path = std::env::temp_dir().join("hr-tr-roundtrip.json");
        let cfg = serde_json::json!({ "cache": { "enabled": true, "minBlockTokens": 1024 } });
        write_config_at(&path, &cfg).unwrap();
        assert_eq!(read_config_at(&path).unwrap(), cfg);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn imaging_config_roundtrips() {
        let path = std::env::temp_dir().join("hr-tr-imaging.json");
        let cfg = serde_json::json!({ "imaging": { "enabled": true } });
        write_config_at(&path, &cfg).unwrap();
        let read = read_config_at(&path).unwrap();
        assert_eq!(read, cfg);
        assert!(imaging_enabled_from_value(&read));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn imaging_enabled_defaults_false_when_absent_or_off() {
        assert!(!imaging_enabled_from_value(&serde_json::json!({})));
        assert!(!imaging_enabled_from_value(
            &serde_json::json!({ "imaging": {} })
        ));
        assert!(!imaging_enabled_from_value(
            &serde_json::json!({ "imaging": { "enabled": false } })
        ));
        assert!(imaging_enabled_from_value(
            &serde_json::json!({ "imaging": { "enabled": true } })
        ));
    }

    #[test]
    fn local_capabilities_gated_on_node() {
        assert_eq!(local_capabilities(true), vec!["imaging.local.v1".to_string()]);
        assert!(local_capabilities(false).is_empty());
    }
}
