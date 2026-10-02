import {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  GameSettings,
  GraphicsQuality,
  PlayerProfile,
  STORAGE_KEYS,
} from '../config/gameConfig';

/**
 * localStorage persistence with defensive parsing.
 * Never throws: private-mode browsers, quota errors and corrupt JSON all
 * fall back to safe defaults so the game always boots.
 */

const memoryFallback: Record<string, string> = {};
let storageAvailable: boolean | null = null;

function getStorage(): Storage | null {
  if (storageAvailable === false) return null;
  try {
    const testKey = '__nmr_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    storageAvailable = true;
    return window.localStorage;
  } catch {
    storageAvailable = false;
    return null;
  }
}

function readRaw(key: string): string | null {
  const storage = getStorage();
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      return memoryFallback[key] ?? null;
    }
  }
  return memoryFallback[key] ?? null;
}

function writeRaw(key: string, value: string): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(key, value);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  memoryFallback[key] = value;
}

function finiteNumber(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

/** Parse + sanitise a stored profile (exported for unit tests). */
export function parseProfile(raw: string | null): PlayerProfile {
  if (!raw) return { ...DEFAULT_PROFILE };
  try {
    const data = JSON.parse(raw) as Partial<PlayerProfile>;
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_PROFILE };
    return {
      highScore: Math.floor(finiteNumber(data.highScore, 0)),
      bestDistance: Math.floor(finiteNumber(data.bestDistance, 0)),
      totalCoins: Math.floor(finiteNumber(data.totalCoins, 0)),
      runs: Math.floor(finiteNumber(data.runs, 0)),
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

const QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high'];

/** Parse + sanitise stored settings (exported for unit tests). */
export function parseSettings(raw: string | null): GameSettings {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<GameSettings> & Record<string, unknown>;
    if (typeof data !== 'object' || data === null) return base;
    const quality = data.quality;
    return {
      quality: QUALITIES.includes(quality as GraphicsQuality)
        ? (quality as GraphicsQuality)
        : base.quality,
      masterVolume: clamp01(finiteNumber(data.masterVolume, base.masterVolume)),
      musicVolume: clamp01(finiteNumber(data.musicVolume, base.musicVolume)),
      sfxVolume: clamp01(finiteNumber(data.sfxVolume, base.sfxVolume)),
      muted: typeof data.muted === 'boolean' ? data.muted : base.muted,
      cameraShake:
        typeof data.cameraShake === 'boolean' ? data.cameraShake : base.cameraShake,
      showFps: typeof data.showFps === 'boolean' ? data.showFps : base.showFps,
      characterVariant: Math.min(
        2,
        Math.max(0, Math.floor(finiteNumber(data.characterVariant, base.characterVariant))),
      ),
    };
  } catch {
    return base;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export class StorageManager {
  private profile: PlayerProfile;
  private settings: GameSettings;

  constructor() {
    this.profile = parseProfile(readRaw(STORAGE_KEYS.PROFILE));
    this.settings = parseSettings(readRaw(STORAGE_KEYS.SETTINGS));
  }

  getProfile(): Readonly<PlayerProfile> {
    return this.profile;
  }

  saveRunResult(score: number, distance: number, coins: number): PlayerProfile {
    this.profile = {
      highScore: Math.max(this.profile.highScore, Math.floor(score)),
      bestDistance: Math.max(this.profile.bestDistance, Math.floor(distance)),
      totalCoins: this.profile.totalCoins + Math.max(0, Math.floor(coins)),
      runs: this.profile.runs + 1,
    };
    writeRaw(STORAGE_KEYS.PROFILE, JSON.stringify(this.profile));
    return this.profile;
  }

  getSettings(): GameSettings {
    return { ...this.settings };
  }

  saveSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    writeRaw(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
  }

  /** Test hook: is real localStorage usable? */
  isPersistent(): boolean {
    return storageAvailable === true;
  }
}
