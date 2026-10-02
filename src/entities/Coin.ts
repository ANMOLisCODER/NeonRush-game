import * as THREE from 'three';
import { COIN_RADIUS } from '../utils/constants';
import { AABB } from '../utils/constants';

/** Pooled coin entity with spin + magnet attraction support. */
export class Coin {
  readonly mesh: THREE.Mesh;
  active = false;
  magnetized = false;
  readonly box: AABB = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  constructor(mesh: THREE.Mesh) {
    this.mesh = mesh;
    this.mesh.visible = false;
  }

  place(x: number, y: number, z: number): void {
    this.active = true;
    this.magnetized = false;
    this.mesh.visible = true;
    this.mesh.position.set(x, y, z);
    this.updateBox();
  }

  move(dz: number): void {
    this.mesh.position.z += dz;
    this.updateBox();
  }

  moveTo(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
    this.updateBox();
  }

  private updateBox(): void {
    const p = this.mesh.position;
    this.box.minX = p.x - COIN_RADIUS;
    this.box.maxX = p.x + COIN_RADIUS;
    this.box.minY = p.y - COIN_RADIUS;
    this.box.maxY = p.y + COIN_RADIUS;
    this.box.minZ = p.z - COIN_RADIUS;
    this.box.maxZ = p.z + COIN_RADIUS;
  }

  spin(dt: number): void {
    this.mesh.rotation.z += dt * 3.4;
  }

  deactivate(): void {
    this.active = false;
    this.mesh.visible = false;
  }
}
