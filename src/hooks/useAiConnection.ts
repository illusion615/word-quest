import { useCallback, useState } from 'react';
import {
  DEFAULT_AI_CONFIG,
  explainWord,
  generateChainReading,
  isAiConfigured,
  testAiConnection,
  type AiConnectionConfig,
  type ChainReading,
} from '../services/aiClient';
import type { ChainBlueprint, WordBankManifest, WordEntry } from '../domain/models';

const SETTINGS_KEY = 'wordbuddy.ai.settings.v1';
const SECRET_KEY = 'wordbuddy.ai.secret.v1';

type PublicAiSettings = Omit<AiConnectionConfig, 'apiKey'>;

function loadConfig(): AiConnectionConfig {
  if (typeof window === 'undefined') return DEFAULT_AI_CONFIG;

  let publicSettings: Partial<PublicAiSettings> = {};
  try {
    publicSettings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}');
  } catch {
    publicSettings = {};
  }

  return {
    ...DEFAULT_AI_CONFIG,
    ...publicSettings,
    apiKey: window.sessionStorage.getItem(SECRET_KEY) ?? '',
  };
}

export function useAiConnection() {
  const [config, setConfig] = useState<AiConnectionConfig>(loadConfig);

  const saveConfig = useCallback((next: AiConnectionConfig) => {
    const sanitized: AiConnectionConfig = {
      endpoint: next.endpoint.trim(),
      model: next.model.trim(),
      apiKey: next.apiKey.trim(),
      authMode: next.authMode,
      outputLanguage: next.outputLanguage.trim() || DEFAULT_AI_CONFIG.outputLanguage,
    };
    const { apiKey, ...publicSettings } = sanitized;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(publicSettings));
    window.sessionStorage.setItem(SECRET_KEY, apiKey);
    setConfig(sanitized);
  }, []);

  const testConnection = useCallback(
    (candidate: AiConnectionConfig) => testAiConnection(candidate),
    [],
  );

  const requestExplanation = useCallback(
    (word: WordEntry, override?: AiConnectionConfig) => explainWord(override ?? config, word),
    [config],
  );

  const requestChainReading = useCallback(
    (blueprint: ChainBlueprint, bank: WordBankManifest): Promise<ChainReading> => (
      generateChainReading(config, blueprint, bank)
    ),
    [config],
  );

  return {
    config,
    isConfigured: isAiConfigured(config),
    saveConfig,
    testConnection,
    requestExplanation,
    requestChainReading,
  };
}