import * as THREE from 'three';
import { POWERUP_RADIUS, PowerUpKind } from '../utils/constants';
import { AABB } from '../utils/constants';

/** Pooled power-up pickup: floating, spinning, bobbing. */
export class PowerUp {
  readonly kind: PowerUpKind;
  readonly group: THREE.Group;
  active = false;
  private baseY = 1.15;
  private phase = 0;
  readonly box: AABB = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  constructor(kind: PowerUpKind, group: THREE.Group) {
    this.kind = kind;
    this.group = group;
    this.group.visible = false;
  }

  place(x: number, z: number): void {
    this.active = true;
    this.group.visible = true;
    this.group.position.set(x, this.baseY, z);
    this.phase = Math.random() * Math.PI * 2;
    this.updateBox();
  }

  update(dt: number, dz: number, time: number): void {
    this.group.position.z += dz;
    this.group.position.y = this.baseY + Math.sin(time * 2.4 + this.phase) * 0.16;
    this.group.rotation.y += dt * 1.8;
    const ring = this.group.getObjectByName('ring');
    if (ring) {
      ring.rotation.x += dt * 2.2;
      ring.rotation.z += dt * 1.1;
    }
    this.updateBox();
  }

  private updateBox(): void {
    const p = this.group.position;
    this.box.minX = p.x - POWERUP_RADIUS;
    this.box.maxX = p.x + POWERUP_RADIUS;
    this.box.minY = p.y - POWERUP_RADIUS;
    this.box.maxY = p.y + POWERUP_RADIUS;
    this.box.minZ = p.z - POWERUP_RADIUS;
    this.box.maxZ = p.z + POWERUP_RADIUS;
  }

  deactivate(): void {
    this.active = false;
    this.group.visible = false;
  }
}
