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

/// Which token-reduction capabilities the proxy reports.
// ponytail: no proxy capability endpoint exists yet, so this returns empty and the
// UI shows "requires proxy" gates. Wire to the real /token-stats capabilities probe
// when it ships (see docs/plans/proxy-dependencies.md).
#[tauri::command]
pub fn get_token_reduction_capabilities() -> Vec<String> {
    Vec::new()
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
}
