import { describe, expect, it } from 'vitest';
import { LANE, PLAYER, laneToX } from '../src/config/gameConfig';
import { clamp } from '../src/utils/math';

/** Lane boundary helpers mirroring Player.moveLeft/moveRight gating. */
function move(lane: number, dir: -1 | 1): number {
  const next = lane + dir;
  return clamp(next, LANE.MIN_INDEX, LANE.MAX_INDEX);
}

describe('lane logic', () => {
  it('has exactly three lanes', () => {
    expect(LANE.COUNT).toBe(3);
    expect(LANE.MAX_INDEX - LANE.MIN_INDEX + 1).toBe(LANE.COUNT);
  });

  it('maps lane indices to symmetric X positions', () => {
    expect(laneToX(-1)).toBeCloseTo(-LANE.WIDTH);
    expect(laneToX(0)).toBe(0);
    expect(laneToX(1)).toBeCloseTo(LANE.WIDTH);
  });

  it('cannot move outside the permitted lanes', () => {
    expect(move(-1, -1)).toBe(-1);
    expect(move(1, 1)).toBe(1);
    // Repeated presses at the edge stay clamped.
    let lane = -1;
    for (let i = 0; i < 10; i++) lane = move(lane, -1);
    expect(lane).toBe(-1);
  });

  it('moves one lane at a time and returns', () => {
    let lane = 0;
    lane = move(lane, 1);
    expect(lane).toBe(1);
    lane = move(lane, -1);
    expect(lane).toBe(0);
    lane = move(lane, -1);
    expect(lane).toBe(-1);
  });

  it('jump clears the low barrier (physics sanity)', () => {
    // Apex height = v^2 / (2 * |g|).
    const apex = (PLAYER.JUMP_VELOCITY * PLAYER.JUMP_VELOCITY) / (2 * -PLAYER.GRAVITY);
    expect(apex).toBeGreaterThan(0.95); // low barrier height
  });

  it('slide fits under overhead obstacles', () => {
    expect(PLAYER.HEIGHT_SLIDE).toBeLessThan(1.12); // overhead bottom edge
    expect(PLAYER.HEIGHT_STAND).toBeGreaterThan(1.12); // standing must collide
  });

  it('airtime covers a barrier at max speed', () => {
    const airtime = (2 * PLAYER.JUMP_VELOCITY) / -PLAYER.GRAVITY;
    // At max speed the player travels far while airborne — timing is about
    // the obstacle depth, which must be much shorter than that travel.
    expect(airtime * 34).toBeGreaterThan(0.7 * 4); // obstacle depth * safety
  });
});
