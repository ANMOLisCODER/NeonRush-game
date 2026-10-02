import { describe, expect, it } from 'vitest';
import { parseProfile, parseSettings } from '../src/core/StorageManager';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../src/config/gameConfig';

describe('StorageManager parsing', () => {
  it('returns defaults for null / empty input', () => {
    expect(parseProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for corrupt JSON', () => {
    expect(parseProfile('{oops')).toEqual(DEFAULT_PROFILE);
    expect(parseSettings(']not json[')).toEqual(DEFAULT_SETTINGS);
    expect(parseProfile('42')).toEqual(DEFAULT_PROFILE);
  });

  it('sanitises hostile / malformed values', () => {
    const profile = parseProfile(
      JSON.stringify({
        highScore: 'not a number',
        bestDistance: -500,
        totalCoins: Infinity,
        runs: null,
      }),
    );
    expect(profile.highScore).toBe(0);
    expect(profile.bestDistance).toBe(0);
    expect(profile.totalCoins).toBe(0);
    expect(profile.runs).toBe(0);
  });

  it('round-trips valid profile data', () => {
    const raw = JSON.stringify({
      highScore: 12345,
      bestDistance: 987,
      totalCoins: 432,
      runs: 9,
    });
    expect(parseProfile(raw)).toEqual({
      highScore: 12345,
      bestDistance: 987,
      totalCoins: 432,
      runs: 9,
    });
  });

  it('rejects invalid quality strings and clamps volumes', () => {
    const s = parseSettings(
      JSON.stringify({
        quality: 'ultra-mega',
        masterVolume: 5,
        musicVolume: -2,
        sfxVolume: 0.4,
        muted: 'yes',
        cameraShake: false,
        showFps: true,
        characterVariant: 99,
      }),
    );
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.masterVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.sfxVolume).toBeCloseTo(0.4);
    expect(s.muted).toBe(DEFAULT_SETTINGS.muted); // non-boolean rejected
    expect(s.cameraShake).toBe(false);
    expect(s.showFps).toBe(true);
    expect(s.characterVariant).toBe(2); // clamped to available variants
  });

  it('accepts valid settings verbatim', () => {
    const raw = JSON.stringify({
      quality: 'low',
      masterVolume: 0.5,
      musicVolume: 0.25,
      sfxVolume: 0.75,
      muted: true,
      cameraShake: false,
      showFps: true,
      characterVariant: 1,
    });
    expect(parseSettings(raw)).toEqual({
      quality: 'low',
      masterVolume: 0.5,
      musicVolume: 0.25,
      sfxVolume: 0.75,
      muted: true,
      cameraShake: false,
      showFps: true,
      characterVariant: 1,
    });
  });
});
