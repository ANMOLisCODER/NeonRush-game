import { describe, expect, it } from 'vitest';
import { ScoreSystem } from '../src/systems/ScoreSystem';
import { SCORE } from '../src/config/gameConfig';

describe('ScoreSystem', () => {
  it('scores distance with the base multiplier', () => {
    const s = new ScoreSystem();
    s.addDistance(100);
    expect(s.getScore()).toBe(Math.floor(100 * SCORE.POINTS_PER_METER * 1));
  });

  it('awards coin points scaled by the multiplier', () => {
    const s = new ScoreSystem();
    s.addCoin();
    expect(s.getCoins()).toBe(1);
    expect(s.getScore()).toBe(SCORE.POINTS_PER_COIN);
  });

  it('grows the streak multiplier with clean distance', () => {
    const s = new ScoreSystem();
    expect(s.getStepMultiplier()).toBe(SCORE.BASE_MULTIPLIER);
    s.addDistance(SCORE.METERS_PER_MULTIPLIER_STEP);
    expect(s.getStepMultiplier()).toBe(2);
    s.addDistance(SCORE.METERS_PER_MULTIPLIER_STEP * 3);
    // 880 m clean -> 4 steps -> x5, which is the configured cap.
    expect(s.getStepMultiplier()).toBe(SCORE.MAX_MULTIPLIER);
  });

  it('caps the streak multiplier at MAX_MULTIPLIER', () => {
    const s = new ScoreSystem();
    s.addDistance(1e7);
    expect(s.getStepMultiplier()).toBe(SCORE.MAX_MULTIPLIER);
  });

  it('resets the streak on a hit but keeps score and coins', () => {
    const s = new ScoreSystem();
    s.addDistance(SCORE.METERS_PER_MULTIPLIER_STEP * 2);
    const scoreBefore = s.getScore();
    s.addCoin();
    s.onHit();
    expect(s.getStepMultiplier()).toBe(SCORE.BASE_MULTIPLIER);
    expect(s.getScore()).toBeGreaterThanOrEqual(scoreBefore);
    expect(s.getCoins()).toBe(1);
  });

  it('stacks the x2 power-up bonus on top of the streak', () => {
    const s = new ScoreSystem();
    s.addDistance(SCORE.METERS_PER_MULTIPLIER_STEP);
    expect(s.getMultiplier(false)).toBe(2);
    expect(s.getMultiplier(true)).toBe(2 + SCORE.POWERUP_MULTIPLIER_BONUS);
  });

  it('higher multiplier yields strictly more score for equal distance', () => {
    const a = new ScoreSystem();
    const b = new ScoreSystem();
    b.addDistance(SCORE.METERS_PER_MULTIPLIER_STEP * 2); // multiplier 3
    a.addDistance(50);
    b.addDistance(50);
    expect(b.getScore()).toBeGreaterThan(a.getScore());
  });

  it('metersToNextStep decreases as clean distance grows', () => {
    const s = new ScoreSystem();
    const before = s.metersToNextStep();
    s.addDistance(50);
    expect(s.metersToNextStep()).toBeLessThan(before);
    s.addDistance(1e7);
    expect(s.metersToNextStep()).toBe(0); // maxed out
  });

  it('reset clears everything', () => {
    const s = new ScoreSystem();
    s.addDistance(500);
    s.addCoin();
    s.reset();
    expect(s.getScore()).toBe(0);
    expect(s.getCoins()).toBe(0);
    expect(s.getStepMultiplier()).toBe(1);
  });
});
