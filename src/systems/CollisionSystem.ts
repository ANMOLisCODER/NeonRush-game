import { AABB } from '../utils/constants';

/**
 * Axis-aligned bounding-box collision detection.
 * Pure functions — fully unit-testable and allocation-free per frame.
 */

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

/** Quick reject on the Z axis only — used to skip far-away entities. */
export function zOverlap(a: AABB, b: AABB, margin = 0): boolean {
  return a.minZ - margin < b.maxZ && a.maxZ + margin > b.minZ;
}

export function aabbCenter(a: AABB): { x: number; y: number; z: number } {
  return {
    x: (a.minX + a.maxX) / 2,
    y: (a.minY + a.maxY) / 2,
    z: (a.minZ + a.maxZ) / 2,
  };
}

export function pointInAABB(x: number, y: number, z: number, b: AABB): boolean {
  return (
    x >= b.minX && x <= b.maxX &&
    y >= b.minY && y <= b.maxY &&
    z >= b.minZ && z <= b.maxZ
  );
}

export class CollisionSystem {
  /** Broad-phase: only entities whose z-window touches the player are tested. */
  static findObstacleHit(playerBox: AABB, obstacles: readonly { box: AABB; active: boolean }[]): number {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active) continue;
      if (!zOverlap(playerBox, o.box, 0.5)) continue;
      if (aabbOverlap(playerBox, o.box)) return i;
    }
    return -1;
  }

  static findCollectibleHit(
    playerBox: AABB,
    items: readonly { box: AABB; active: boolean }[],
  ): number {
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      if (!c.active) continue;
      if (!zOverlap(playerBox, c.box, 0.4)) continue;
      if (aabbOverlap(playerBox, c.box)) return i;
    }
    return -1;
  }
}
