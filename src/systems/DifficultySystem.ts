import { DIFFICULTY } from '../config/gameConfig';
import { clamp } from '../utils/math';

/**
 * Pure difficulty progression logic.
 *
 * Speed ramps smoothly from START_SPEED to MAX_SPEED over the course of a
 * run, obstacle rows get closer together, and discrete "stages" unlock richer
 * spawn patterns. No Three.js dependency so it is fully unit-testable.
 */
export class DifficultySystem {
  private distance = 0;
  private speed: number = DIFFICULTY.START_SPEED;

  reset(): void {
    this.distance = 0;
    this.speed = DIFFICULTY.START_SPEED;
  }

  /** Advance simulation. dt is seconds (already clamped by the game loop). */
  update(dt: number): void {
    this.speed = Math.min(
      DIFFICULTY.MAX_SPEED,
      this.speed + DIFFICULTY.SPEED_RAMP * dt,
    );
    this.distance += this.speed * dt;
  }

  getDistance(): number {
    return this.distance;
  }

  getSpeed(): number {
    return this.speed;
  }

  /** Normalised 0..1 progress from start speed to max speed. */
  getProgress(): number {
    return clamp(
      (this.speed - DIFFICULTY.START_SPEED) /
        (DIFFICULTY.MAX_SPEED - DIFFICULTY.START_SPEED),
      0,
      1,
    );
  }

  /** Discrete difficulty stage 1..MAX_STAGE driven by travelled distance. */
  getStage(): number {
    return DifficultySystem.stageForDistance(this.distance);
  }

  static stageForDistance(distance: number): number {
    return clamp(
      1 + Math.floor(Math.max(0, distance) / DIFFICULTY.METERS_PER_STAGE),
      1,
      DIFFICULTY.MAX_STAGE,
    );
  }

  /** Current gap (metres) between consecutive obstacle rows. */
  getRowGap(): number {
    return DifficultySystem.rowGapForProgress(this.getProgress());
  }

  static rowGapForProgress(progress: number): number {
    const t = clamp(progress, 0, 1);
    return DIFFICULTY.START_ROW_GAP + (DIFFICULTY.MIN_ROW_GAP - DIFFICULTY.START_ROW_GAP) * t;
  }

  /** Pure helpers used by the spawn system and tests. */
  static speedForDistance(distance: number): number {
    // Analytic approximation of the ramp (speed grows linearly with time; this
    // closed form is used only by tests/documentation for sanity bounds).
    return clamp(
      DIFFICULTY.START_SPEED + distance * 0.045,
      DIFFICULTY.START_SPEED,
      DIFFICULTY.MAX_SPEED,
    );
  }
}
