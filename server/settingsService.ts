import fs from 'fs';
import path from 'path';
import { BRAIN_MODELS, NexusSettings } from '../src/types/nexus.ts';
import { decryptString, encryptString, isEncryptionConfigured } from './encryption.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'nexus_settings.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'nexus_credentials.json');

const ENV_PLACEHOLDER_KEYS = new Set(['YOUR_OPENROUTER_API_KEY', 'MY_OPENROUTER_API_KEY', '']);

interface StoredCredentials {
  openRouterApiKeyEnc?: string;
  openRouterApiKeyHint?: string;
  updatedAt?: string;
}

export const DEFAULT_NEXUS_SETTINGS: NexusSettings = {
  defaultBrain: 'FLASH',
  brainMode: 'AUTO',
  flashModelId: BRAIN_MODELS.FLASH,
  reasoningModelId: BRAIN_MODELS.REASONING,
  fallbackModelId: 'openai/gpt-4.1-mini',
  enableVerifiedFallback: true,
  temperature: 0.4,
  maxOutputTokens: 2048,
  streamingEnabled: true,
  agentPersona: {
    replyPattern: 'structured',
    tone: 'warm',
    verbosity: 'balanced',
    personality: '',
    customInstructions: '',
  },
  memoryPolicy: {
    injectUserMemory: true,
    injectProjectMemory: true,
    requireExplicitApprovalToSave: true,
  },
  agentLimits: {
    maxPlanSteps: 6,
    toolTimeoutMs: 8000,
    requireApprovalForExternalTools: true,
  },
  enabledTools: {
    datetime_inspector: true,
    precision_calculator: true,
    text_summarizer_analyzer: true,
    file_content_analyzer: true,
    workspace_memory_lookup: true,
    external_webhook_dispatch: true,
  },
  appearance: {
    glassBlurIntensity: 'balanced',
    ambientGlow: 'violet_cyan',
    compactDensity: false,
  },
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export class SettingsService {
  private settings: NexusSettings;

  constructor() {
    ensureDataDir();
    this.settings = this.load();
  }

  private load(): NexusSettings {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_NEXUS_SETTINGS,
          ...parsed,
          agentPersona: {
            ...DEFAULT_NEXUS_SETTINGS.agentPersona,
            ...(parsed.agentPersona || {}),
          },
          memoryPolicy: { ...DEFAULT_NEXUS_SETTINGS.memoryPolicy, ...(parsed.memoryPolicy || {}) },
          agentLimits: { ...DEFAULT_NEXUS_SETTINGS.agentLimits, ...(parsed.agentLimits || {}) },
          enabledTools: { ...DEFAULT_NEXUS_SETTINGS.enabledTools, ...(parsed.enabledTools || {}) },
          appearance: { ...DEFAULT_NEXUS_SETTINGS.appearance, ...(parsed.appearance || {}) },
        };
      }
    } catch (err) {
      console.error('Failed to read settings file, using defaults:', err);
    }
    this.save(DEFAULT_NEXUS_SETTINGS);
    return { ...DEFAULT_NEXUS_SETTINGS };
  }

  private save(settings: NexusSettings): void {
    ensureDataDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  }

  public getSettings(): NexusSettings {
    return this.settings;
  }

  public updateSettings(partial: Partial<NexusSettings>): NexusSettings {
    const temperature =
      typeof partial.temperature === 'number'
        ? Math.max(0, Math.min(1.5, partial.temperature))
        : this.settings.temperature;

    const maxOutputTokens =
      typeof partial.maxOutputTokens === 'number'
        ? Math.max(256, Math.min(8192, Math.round(partial.maxOutputTokens)))
        : this.settings.maxOutputTokens;

    this.settings = {
      ...this.settings,
      ...partial,
      temperature,
      maxOutputTokens,
      agentPersona: {
        ...this.settings.agentPersona,
        ...(partial.agentPersona || {}),
      },
      memoryPolicy: {
        ...this.settings.memoryPolicy,
        ...(partial.memoryPolicy || {}),
      },
      agentLimits: {
        ...this.settings.agentLimits,
        ...(partial.agentLimits || {}),
      },
      enabledTools: {
        ...this.settings.enabledTools,
        ...(partial.enabledTools || {}),
      },
      appearance: {
        ...this.settings.appearance,
        ...(partial.appearance || {}),
      },
    };

    this.save(this.settings);
    return this.settings;
  }

  public resetSettings(): NexusSettings {
    this.settings = { ...DEFAULT_NEXUS_SETTINGS };
    this.save(this.settings);
    return this.settings;
  }

  // --- OpenRouter credential: supplied by the user in Settings, encrypted at rest ---

  private readCredentials(): StoredCredentials {
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed as StoredCredentials;
      }
    } catch (err) {
      console.error('Failed to read stored credentials:', err);
    }
    return {};
  }

  private writeCredentials(credentials: StoredCredentials): void {
    ensureDataDir();
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  /** Resolves the working key without ever exposing it to the browser. */
  public getOpenRouterApiKey(): {
    key: string | null;
    source: 'user' | 'environment' | 'none';
    hint?: string;
  } {
    const credentials = this.readCredentials();
    if (credentials.openRouterApiKeyEnc && isEncryptionConfigured()) {
      try {
        const key = decryptString(credentials.openRouterApiKeyEnc).trim();
        if (key) {
          return { key, source: 'user', hint: credentials.openRouterApiKeyHint };
        }
      } catch (err) {
        console.error('Stored OpenRouter key could not be decrypted:', err);
      }
    }

    const envKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (envKey && !ENV_PLACEHOLDER_KEYS.has(envKey)) {
      return { key: envKey, source: 'environment', hint: maskKey(envKey) };
    }
    return { key: null, source: 'none' };
  }

  public async setOpenRouterApiKey(rawKey: string): Promise<{ hint: string }> {
    const key = (rawKey || '').trim();
    if (!/^sk-or-[A-Za-z0-9._-]{10,}$/.test(key)) {
      throw new Error('That does not look like an OpenRouter key — it starts with "sk-or-".');
    }
    if (!isEncryptionConfigured()) {
      throw new Error('The server encryption key is missing, so your key cannot be stored safely.');
    }
    const verdict = await verifyOpenRouterKey(key);
    if (verdict === 'invalid') {
      throw new Error('OpenRouter rejected that key. Copy it again from openrouter.ai/keys.');
    }
    const hint = maskKey(key);
    this.writeCredentials({
      openRouterApiKeyEnc: encryptString(key),
      openRouterApiKeyHint: hint,
      updatedAt: new Date().toISOString(),
    });
    return { hint };
  }

  public clearOpenRouterApiKey(): void {
    this.writeCredentials({});
  }
}

function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

/** Only an explicit rejection invalidates a key; network trouble must not block saving. */
async function verifyOpenRouterKey(key: string): Promise<'valid' | 'invalid' | 'unknown'> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 401 || res.status === 403) return 'invalid';
    return res.ok ? 'valid' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const settingsService = new SettingsService();
