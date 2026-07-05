import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import type { TokenReductionConfig } from "./tokenReductionContracts";

export async function loadTokenReductionConfig(): Promise<TokenReductionConfig> {
  return (await invoke("get_token_reduction_config")) as TokenReductionConfig;
}

export async function saveTokenReductionConfig(config: TokenReductionConfig): Promise<void> {
  await invoke("set_token_reduction_config", { config });
}

// Optimistic config hook: local state updates immediately, persists to the
// proxy-read config file. Feature panels use this for their full-knob forms.
export function useTokenReductionConfig() {
  const [config, setConfig] = useState<TokenReductionConfig>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadTokenReductionConfig()
      .then((c) => setConfig(c))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback(async (next: TokenReductionConfig) => {
    setConfig(next);
    await saveTokenReductionConfig(next);
  }, []);

  return { config, loaded, update };
}
