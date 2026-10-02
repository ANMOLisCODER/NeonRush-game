import * as THREE from 'three';
import { WORLD } from '../config/gameConfig';
import { ChunkType } from '../utils/constants';
import { clamp } from '../utils/math';
import { ChunkGenerator } from './ChunkGenerator';
import { EnvironmentFactory } from './EnvironmentFactory';

interface Chunk {
  id: number;
  group: THREE.Group;
  decor: THREE.Group | null;
  type: ChunkType;
}

/**
 * Endless track via chunk recycling (object pooling at the track level):
 * a fixed ring of chunks scrolls towards the player; once a chunk falls
 * behind the camera it teleports to the front with freshly-chosen decor.
 * Nothing is created or destroyed during play — zero GC churn.
 */
export class TrackManager {
  readonly chunks: Chunk[] = [];
  private basePrototype: THREE.Group;
  private chunkCounter = 0;
  private generator: ChunkGenerator;

  constructor(
    private scene: THREE.Scene,
    private env: EnvironmentFactory,
    seed: number,
  ) {
    this.basePrototype = env.buildTrackBase();
    this.generator = new ChunkGenerator(() => Math.random());
    this.generator.reset(seed);
  }

  /** (Re)build the chunk ring for the current quality preset. */
  build(count: number, seed: number): void {
    this.clear();
    this.generator.reset(seed);
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const base = this.basePrototype.clone(true);
      group.add(base);
      group.position.z = WORLD.CHUNK_LENGTH / 2 - i * WORLD.CHUNK_LENGTH;
      const chunk: Chunk = {
        id: this.chunkCounter++,
        group,
        decor: null,
        type: 'open',
      };
      this.decorate(chunk, i);
      this.chunks.push(chunk);
      this.scene.add(group);
    }
  }

  private decorate(chunk: Chunk, forceIndex = -1): void {
    const index = forceIndex >= 0 ? forceIndex : chunk.id;
    const type = this.generator.next(index);
    const variant = this.generator.nextVariant();
    const proto = this.env.getDecorPrototype(type, variant);
    const decor = proto.clone(true) as THREE.Group;
    // Per-chunk jitter for variety without new geometry.
    decor.position.z = forceIndex >= 0 ? 0 : (this.generator.nextVariant() - 0.5) * 4;
    if (this.generator.nextVariant() === 1) decor.rotation.y = Math.PI;
    chunk.type = type;
    chunk.decor = decor;
    chunk.group.add(decor);
  }

  /** Scroll chunks; recycle any that fell behind the camera. */
  update(deltaZ: number): void {
    let minZ = Infinity;
    for (const chunk of this.chunks) {
      chunk.group.position.z += deltaZ;
      if (chunk.group.position.z < minZ) minZ = chunk.group.position.z;
    }
    for (const chunk of this.chunks) {
      // Fully behind camera plane -> recycle to the front of the ring.
      if (chunk.group.position.z - WORLD.CHUNK_LENGTH / 2 > WORLD.DESPAWN_BEHIND + 8) {
        chunk.group.position.z = minZ - WORLD.CHUNK_LENGTH;
        minZ = chunk.group.position.z;
        this.undecorate(chunk);
        this.decorate(chunk);
        chunk.id = this.chunkCounter++;
      }
    }
  }

  private undecorate(chunk: Chunk): void {
    if (chunk.decor) {
      chunk.group.remove(chunk.decor);
      // Decor clones share cached geometry/materials owned by
      // EnvironmentFactory — detach only, never dispose here.
      chunk.decor = null;
    }
  }

  /** Chunk currently under the player (z ~ 0) — for the debug overlay. */
  getCurrentChunk(): Chunk | null {
    let best: Chunk | null = null;
    let bestDist = Infinity;
    for (const chunk of this.chunks) {
      const dist = Math.abs(chunk.group.position.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = chunk;
      }
    }
    return best;
  }

  getActiveObjectCount(): number {
    let count = 0;
    for (const chunk of this.chunks) {
      chunk.group.traverse(() => count++);
    }
    return count;
  }

  /** Clamp chunk count changes coming from quality switches. */
  resize(count: number, seed: number): void {
    const clamped = clamp(count, 5, 16);
    if (clamped === this.chunks.length) return;
    this.build(clamped, seed);
  }

  clear(): void {
    for (const chunk of this.chunks) {
      this.undecorate(chunk);
      chunk.group.removeFromParent();
    }
    this.chunks.length = 0;
  }
}
