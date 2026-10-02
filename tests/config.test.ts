import { describe, expect, it } from 'vitest';
import {
  CAMERA,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  DIFFICULTY,
  LANE,
  LIVES,
  PLAYER,
  POWERUPS,
  QUALITY_PRESETS,
  SCORE,
  WORLD,
} from '../src/config/gameConfig';

describe('gameConfig validation', () => {
  it('quality presets are strictly ordered low < medium < high', () => {
    const order = ['low', 'medium', 'high'] as const;
    for (let i = 1; i < order.length; i++) {
      const prev = QUALITY_PRESETS[order[i - 1]];
      const next = QUALITY_PRESETS[order[i]];
      expect(next.pixelRatioCap).toBeGreaterThanOrEqual(prev.pixelRatioCap);
      expect(next.shadowMapSize).toBeGreaterThanOrEqual(prev.shadowMapSize);
      expect(next.drawDistance).toBeGreaterThan(prev.drawDistance);
      expect(next.fogFar).toBeGreaterThan(prev.fogFar);
      expect(next.maxParticles).toBeGreaterThan(prev.maxParticles);
      expect(next.decorDensity).toBeGreaterThanOrEqual(prev.decorDensity);
      expect(next.chunkCount).toBeGreaterThanOrEqual(prev.chunkCount);
    }
    expect(QUALITY_PRESETS.low.shadows).toBe(false);
    expect(QUALITY_PRESETS.high.shadows).toBe(true);
  });

  it('every preset can cover the spawn distance with its chunk ring', () => {
    for (const preset of Object.values(QUALITY_PRESETS)) {
      expect(preset.chunkCount * WORLD.CHUNK_LENGTH).toBeGreaterThan(
        WORLD.SPAWN_DISTANCE * 0.6,
      );
      expect(preset.fogFar).toBeLessThanOrEqual(preset.drawDistance);
    }
  });

  it('difficulty ramps forward and stays bounded', () => {
    expect(DIFFICULTY.MAX_SPEED).toBeGreaterThan(DIFFICULTY.START_SPEED);
    expect(DIFFICULTY.START_ROW_GAP).toBeGreaterThan(DIFFICULTY.MIN_ROW_GAP);
    expect(DIFFICULTY.MAX_STAGE).toBeGreaterThanOrEqual(1);
    expect(DIFFICULTY.METERS_PER_STAGE).toBeGreaterThan(0);
    expect(DIFFICULTY.START_GRACE_DISTANCE).toBeGreaterThan(30);
  });

  it('score multiplier bounds are sane', () => {
    expect(SCORE.MAX_MULTIPLIER).toBeGreaterThan(SCORE.BASE_MULTIPLIER);
    expect(SCORE.METERS_PER_MULTIPLIER_STEP).toBeGreaterThan(0);
    expect(SCORE.POINTS_PER_COIN).toBeGreaterThan(0);
  });

  it('player physics constants are consistent', () => {
    expect(PLAYER.JUMP_VELOCITY).toBeGreaterThan(0);
    expect(PLAYER.GRAVITY).toBeLessThan(0);
    expect(PLAYER.HEIGHT_SLIDE).toBeLessThan(PLAYER.HEIGHT_STAND);
    expect(PLAYER.WIDTH).toBeLessThan(LANE.WIDTH); // fits inside a lane
    expect(PLAYER.INVINCIBLE_TIME).toBeGreaterThan(0.5);
    expect(LIVES.COUNT).toBe(3);
  });

  it('camera framing constants are stable', () => {
    expect(CAMERA.FOV_MAX).toBeGreaterThan(CAMERA.FOV_BASE);
    expect(CAMERA.OFFSET_Z).toBeGreaterThan(2);
    expect(CAMERA.OFFSET_Y).toBeGreaterThan(1);
    expect(CAMERA.LOOK_AHEAD_Z).toBeLessThan(0); // forward is -Z
  });

  it('power-up durations are limited (nothing lasts forever)', () => {
    for (const pu of [POWERUPS.MAGNET, POWERUPS.SHIELD, POWERUPS.MULTIPLIER, POWERUPS.JET]) {
      expect(pu.duration).toBeGreaterThan(2);
      expect(pu.duration).toBeLessThanOrEqual(20);
    }
    expect(POWERUPS.SPAWN_CHANCE).toBeGreaterThan(0);
    expect(POWERUPS.SPAWN_CHANCE).toBeLessThan(0.5);
  });

  it('defaults are complete and serialisable', () => {
    expect(() => JSON.stringify(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => JSON.stringify(DEFAULT_PROFILE)).not.toThrow();
    expect(DEFAULT_SETTINGS.quality).toBe('medium');
    expect(DEFAULT_PROFILE.highScore).toBe(0);
  });
});
