import { GameSettings, QUALITY_PRESETS, QualityPreset } from '../config/gameConfig';
import { GAME_EVENTS } from '../utils/constants';
import { StorageManager } from './StorageManager';

/**
 * Owns user settings, persists them through StorageManager and broadcasts
 * GAME_EVENTS.SETTINGS_CHANGED so renderer / audio / camera react live.
 */
export class SettingsManager {
  private settings: GameSettings;

  constructor(private storage: StorageManager) {
    this.settings = storage.getSettings();
  }

  get(): Readonly<GameSettings> {
    return this.settings;
  }

  getPreset(): QualityPreset {
    return QUALITY_PRESETS[this.settings.quality];
  }

  update(patch: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.storage.saveSettings(this.settings);
    window.dispatchEvent(
      new CustomEvent(GAME_EVENTS.SETTINGS_CHANGED, { detail: this.settings }),
    );
  }

  /** Effective device pixel ratio cap combining preset + hardware. */
  effectivePixelRatio(): number {
    const cap = QUALITY_PRESETS[this.settings.quality].pixelRatioCap;
    return Math.min(window.devicePixelRatio || 1, cap);
  }
}
