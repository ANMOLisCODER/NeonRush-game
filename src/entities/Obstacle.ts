import * as THREE from 'three';
import { AABB, OBSTACLE_DIMS, ObstacleKind } from '../utils/constants';
import { laneToX } from '../config/gameConfig';

/**
 * Pooled obstacle entity. The collision box is derived from deterministic
 * per-kind dimensions (not from mesh bounds) so gameplay stays predictable
 * even if visuals are tweaked.
 */
export class Obstacle {
  readonly kind: ObstacleKind;
  readonly variant: number;
  readonly group: THREE.Group;
  lane = 0;
  active = false;
  readonly box: AABB = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  /** Extra length for trains (varies per spawn for readability). */
  lengthScale = 1;

  constructor(kind: ObstacleKind, variant: number, group: THREE.Group) {
    this.kind = kind;
    this.variant = variant;
    this.group = group;
    this.group.visible = false;
  }

  place(lane: number, z: number, lengthScale = 1): void {
    this.lane = lane;
    this.lengthScale = this.kind === 'train' ? lengthScale : 1;
    this.active = true;
    this.group.visible = true;
    this.group.position.set(laneToX(lane), 0, z);
    this.group.scale.z = this.lengthScale;
    this.updateBox();
  }

  move(dz: number): void {
    this.group.position.z += dz;
    this.updateBox();
  }

  private updateBox(): void {
    const dims = OBSTACLE_DIMS[this.kind];
    const depth = dims.d * this.lengthScale;
    const x = this.group.position.x;
    const z = this.group.position.z;
    const halfW = dims.w / 2;
    const halfD = depth / 2;
    this.box.minX = x - halfW;
    this.box.maxX = x + halfW;
    this.box.minY = dims.y;
    this.box.maxY = dims.y + dims.h;
    this.box.minZ = z - halfD;
    this.box.maxZ = z + halfD;
  }

  deactivate(): void {
    this.active = false;
    this.group.visible = false;
  }
}
