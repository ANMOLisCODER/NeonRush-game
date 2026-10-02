import { describe, expect, it } from 'vitest';
import {
  CollisionSystem,
  aabbOverlap,
  pointInAABB,
  zOverlap,
} from '../src/systems/CollisionSystem';
import { AABB } from '../src/utils/constants';

function box(
  minX: number, maxX: number,
  minY: number, maxY: number,
  minZ: number, maxZ: number,
): AABB {
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const unit = box(-0.5, 0.5, 0, 1, -0.5, 0.5);

describe('AABB collision', () => {
  it('detects overlap', () => {
    expect(aabbOverlap(unit, box(0.2, 1.2, 0.4, 1.4, 0.1, 1.1))).toBe(true);
  });

  it('touching edges do not count as overlap (strict inequality)', () => {
    expect(aabbOverlap(unit, box(0.5, 1.5, 0, 1, -0.5, 0.5))).toBe(false);
  });

  it('separation on any axis prevents overlap', () => {
    expect(aabbOverlap(unit, box(2, 3, 0, 1, -0.5, 0.5))).toBe(false); // x apart
    expect(aabbOverlap(unit, box(-0.5, 0.5, 3, 4, -0.5, 0.5))).toBe(false); // y apart
    expect(aabbOverlap(unit, box(-0.5, 0.5, 0, 1, 4, 5))).toBe(false); // z apart
  });

  it('z broad-phase rejects far entities', () => {
    expect(zOverlap(unit, box(-0.5, 0.5, 0, 1, 10, 11))).toBe(false);
    expect(zOverlap(unit, box(-0.5, 0.5, 0, 1, 0.2, 11))).toBe(true);
  });

  it('point containment works', () => {
    expect(pointInAABB(0, 0.5, 0, unit)).toBe(true);
    expect(pointInAABB(0, 1.5, 0, unit)).toBe(false);
  });

  it('jumping clears a low barrier', () => {
    // Player box lifted above the 0.95 m barrier.
    const jumpingPlayer = box(-0.36, 0.36, 1.2, 2.92, -0.31, 0.31);
    const barrier = box(-0.95, 0.95, 0, 0.95, -0.35, 0.35);
    expect(aabbOverlap(jumpingPlayer, barrier)).toBe(false);
    const grounded = box(-0.36, 0.36, 0.05, 1.77, -0.31, 0.31);
    expect(aabbOverlap(grounded, barrier)).toBe(true);
  });

  it('sliding passes under an overhead obstacle', () => {
    const sliding = box(-0.36, 0.36, 0.05, 0.8, -0.31, 0.31);
    const overhead = box(-1.05, 1.05, 1.12, 2.12, -0.3, 0.3);
    expect(aabbOverlap(sliding, overhead)).toBe(false);
    const standing = box(-0.36, 0.36, 0.05, 1.77, -0.31, 0.31);
    expect(aabbOverlap(standing, overhead)).toBe(true);
  });

  it('lane switch avoids a tall obstacle in the old lane', () => {
    const player = box(2.4 - 0.36, 2.4 + 0.36, 0.05, 1.77, -0.31, 0.31);
    const tall = box(-0.98, 0.98, 0, 2.7, -0.5, 0.5);
    expect(aabbOverlap(player, tall)).toBe(false);
  });

  it('findObstacleHit returns the first overlapping active obstacle', () => {
    const obstacles = [
      { box: box(-0.5, 0.5, 0, 1, -30, -29), active: true }, // far, z-rejected
      { box: box(-0.5, 0.5, 0, 1, 5, 6), active: true }, // behind
      { box: box(-0.5, 0.5, 0, 1, -0.2, 0.2), active: true }, // hit
      { box: box(-0.5, 0.5, 0, 1, -0.2, 0.2), active: false }, // inactive
    ];
    expect(CollisionSystem.findObstacleHit(unit, obstacles)).toBe(2);
  });

  it('findObstacleHit returns -1 when nothing overlaps', () => {
    const obstacles = [{ box: box(3, 4, 0, 1, -0.2, 0.2), active: true }];
    expect(CollisionSystem.findObstacleHit(unit, obstacles)).toBe(-1);
  });

  it('findCollectibleHit picks up overlapping coins', () => {
    const coins = [
      { box: box(-0.3, 0.3, 0.6, 1.2, -0.3, 0.3), active: true },
      { box: box(-0.3, 0.3, 0.6, 1.2, -9.3, -8.7), active: true },
    ];
    expect(CollisionSystem.findCollectibleHit(unit, coins)).toBe(0);
  });
});
