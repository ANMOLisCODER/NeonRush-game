import { describe, expect, it } from 'vitest';
import { DifficultySystem } from '../src/systems/DifficultySystem';
import { DIFFICULTY } from '../src/config/gameConfig';

describe('DifficultySystem', () => {
  it('starts at beginner-friendly speed', () => {
    const d = new DifficultySystem();
    expect(d.getSpeed()).toBeCloseTo(DIFFICULTY.START_SPEED);
    expect(d.getDistance()).toBe(0);
    expect(d.getStage()).toBe(1);
  });

  it('accelerates over time but never exceeds the max speed', () => {
    const d = new DifficultySystem();
    let last = d.getSpeed();
    // Simulate ~10 minutes at 60 fps.
    for (let i = 0; i < 60 * 600; i++) {
      d.update(1 / 60);
      expect(d.getSpeed()).toBeGreaterThanOrEqual(last - 1e-9);
      last = d.getSpeed();
    }
    expect(d.getSpeed()).toBeLessThanOrEqual(DIFFICULTY.MAX_SPEED + 1e-9);
    expect(d.getSpeed()).toBeGreaterThan(DIFFICULTY.START_SPEED + 10);
  });

  it('accumulates distance consistent with speed', () => {
    const d = new DifficultySystem();
    for (let i = 0; i < 600; i++) d.update(1 / 60);
    // 10 s at >= START_SPEED m/s.
    expect(d.getDistance()).toBeGreaterThanOrEqual(DIFFICULTY.START_SPEED * 10 - 1);
  });

  it('advances stages with distance and clamps to MAX_STAGE', () => {
    expect(DifficultySystem.stageForDistance(0)).toBe(1);
    expect(DifficultySystem.stageForDistance(DIFFICULTY.METERS_PER_STAGE)).toBe(2);
    expect(
      DifficultySystem.stageForDistance(DIFFICULTY.METERS_PER_STAGE * 50),
    ).toBe(DIFFICULTY.MAX_STAGE);
    expect(DifficultySystem.stageForDistance(-100)).toBe(1);
  });

  it('shrinks the row gap as difficulty progresses, within bounds', () => {
    expect(DifficultySystem.rowGapForProgress(0)).toBeCloseTo(DIFFICULTY.START_ROW_GAP);
    expect(DifficultySystem.rowGapForProgress(1)).toBeCloseTo(DIFFICULTY.MIN_ROW_GAP);
    expect(DifficultySystem.rowGapForProgress(0.5)).toBeGreaterThan(DIFFICULTY.MIN_ROW_GAP);
    expect(DifficultySystem.rowGapForProgress(0.5)).toBeLessThan(DIFFICULTY.START_ROW_GAP);
    // Out-of-range progress is clamped.
    expect(DifficultySystem.rowGapForProgress(-3)).toBeCloseTo(DIFFICULTY.START_ROW_GAP);
    expect(DifficultySystem.rowGapForProgress(9)).toBeCloseTo(DIFFICULTY.MIN_ROW_GAP);
  });

  it('reset() restores the initial state', () => {
    const d = new DifficultySystem();
    for (let i = 0; i < 600; i++) d.update(1 / 60);
    d.reset();
    expect(d.getSpeed()).toBeCloseTo(DIFFICULTY.START_SPEED);
    expect(d.getDistance()).toBe(0);
  });

  it('reaction time stays fair: gap / speed above human threshold', () => {
    // Even at max speed the minimum row gap leaves > 0.5 s of reaction time.
    expect(DIFFICULTY.MIN_ROW_GAP / DIFFICULTY.MAX_SPEED).toBeGreaterThan(0.5);
  });
});
