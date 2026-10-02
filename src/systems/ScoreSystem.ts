import { SCORE } from '../config/gameConfig';
import { clamp } from '../utils/math';

/**
 * Pure scoring logic: distance points, coin points, and a clean-run
 * multiplier that grows the longer the player survives without taking a hit.
 */
export class ScoreSystem {
  private score = 0;
  private coins = 0;
  private cleanDistance = 0;

  reset(): void {
    this.score = 0;
    this.coins = 0;
    this.cleanDistance = 0;
  }

  /** Called every frame with metres travelled (already speed*dt). */
  addDistance(meters: number): void {
    this.cleanDistance += meters;
    this.score += meters * SCORE.POINTS_PER_METER * this.getMultiplier(false);
  }

  addCoin(): void {
    this.coins += 1;
    this.score += SCORE.POINTS_PER_COIN * this.getMultiplier(false);
  }

  /** A hit resets the clean-run streak (multiplier back to base). */
  onHit(): void {
    this.cleanDistance = 0;
  }

  getScore(): number {
    return Math.floor(this.score);
  }

  getCoins(): number {
    return this.coins;
  }

  getCleanDistance(): number {
    return this.cleanDistance;
  }

  /**
   * Streak multiplier: +1 for every METERS_PER_MULTIPLIER_STEP metres of
   * clean running, capped at MAX_MULTIPLIER.
   */
  getStepMultiplier(): number {
    return clamp(
      SCORE.BASE_MULTIPLIER +
        Math.floor(this.cleanDistance / SCORE.METERS_PER_MULTIPLIER_STEP),
      SCORE.BASE_MULTIPLIER,
      SCORE.MAX_MULTIPLIER,
    );
  }

  /** Total multiplier including the x2 power-up bonus when active. */
  getMultiplier(powerUpActive: boolean): number {
    return (
      this.getStepMultiplier() +
      (powerUpActive ? SCORE.POWERUP_MULTIPLIER_BONUS : 0)
    );
  }

  /** Metres until the next streak multiplier step (for HUD hints). */
  metersToNextStep(): number {
    const step = this.getStepMultiplier();
    if (step >= SCORE.MAX_MULTIPLIER) return 0;
    return (step - SCORE.BASE_MULTIPLIER + 1) * SCORE.METERS_PER_MULTIPLIER_STEP - this.cleanDistance;
  }
}
