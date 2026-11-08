import fs from 'fs';
import path from 'path';
import { BRAIN_MODELS, NexusSettings } from '../src/types/nexus.ts';
import { syncDoc } from './supabaseStore.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'nexus_settings.json');

export const DEFAULT_NEXUS_SETTINGS: NexusSettings = {
  defaultBrain: 'FLASH',
  brainMode: 'AUTO',
  flashModelId: BRAIN_MODELS.FLASH,
  reasoningModelId: BRAIN_MODELS.REASONING,
  fallbackModelId: 'openai/gpt-4o-mini',
  enableVerifiedFallback: true,
  temperature: 0.4,
  maxOutputTokens: 2048,
  streamingEnabled: true,
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
    memory_save: true,
    gmail_search: true,
    gmail_read: true,
    gmail_send: true,
    calendar_list_events: true,
    calendar_create_event: true,
    drive_search: true,
    drive_read_file: true,
    external_webhook_dispatch: false,
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
  private cloudSyncEnabled = false;

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
    if (this.cloudSyncEnabled) {
      syncDoc('settings', 'default', settings);
    }
  }

  /** Applies the cloud copy (or seeds the cloud with local defaults). */
  public hydrateFromCloud(remote: Partial<NexusSettings> | null): void {
    if (remote) {
      this.settings = {
        ...DEFAULT_NEXUS_SETTINGS,
        ...remote,
        memoryPolicy: {
          ...DEFAULT_NEXUS_SETTINGS.memoryPolicy,
          ...(remote.memoryPolicy || {}),
        },
        agentLimits: {
          ...DEFAULT_NEXUS_SETTINGS.agentLimits,
          ...(remote.agentLimits || {}),
        },
        enabledTools: {
          ...DEFAULT_NEXUS_SETTINGS.enabledTools,
          ...(remote.enabledTools || {}),
        },
        appearance: {
          ...DEFAULT_NEXUS_SETTINGS.appearance,
          ...(remote.appearance || {}),
        },
      };
      ensureDataDir();
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
    } else {
      syncDoc('settings', 'default', this.settings);
    }
    this.cloudSyncEnabled = true;
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
}

export const settingsService = new SettingsService();
