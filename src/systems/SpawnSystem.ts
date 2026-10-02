import * as THREE from 'three';
import {
  DIFFICULTY,
  POWERUPS,
  WORLD,
  laneToX,
} from '../config/gameConfig';
import { Coin } from '../entities/Coin';
import { Obstacle } from '../entities/Obstacle';
import { PowerUp } from '../entities/PowerUp';
import { ObstacleKind, PowerUpKind, SpawnRow } from '../utils/constants';
import { mulberry32, randRange } from '../utils/math';
import { EnvironmentFactory } from '../world/EnvironmentFactory';
import { ObjectPool } from './ObjectPool';
import { passableLanes, planRow } from './PatternPlanner';

export interface SpawnContext {
  distance: number;
  speed: number;
  stage: number;
  rowGap: number;
  playerX: number;
  playerY: number;
  magnetActive: boolean;
  jetActive: boolean;
}

const COIN_SPACING = 1.55;

/**
 * Distance-space row scheduler + entity pool manager.
 *
 * Rows are scheduled against *travelled distance* (not world position), so
 * spacing stays exact at every speed. Entities spawn ~SPAWN_DISTANCE metres
 * ahead, scroll towards the player and are recycled to pools when they fall
 * behind — nothing is created or garbage-collected mid-run.
 */
export class SpawnSystem {
  obstacles: Obstacle[] = [];
  coins: Coin[] = [];
  powerups: PowerUp[] = [];

  private obstaclePools = new Map<string, ObjectPool<Obstacle>>();
  private coinPool!: ObjectPool<Coin>;
  private powerupPools = new Map<PowerUpKind, ObjectPool<PowerUp>>();

  private rng: () => number = mulberry32(1);
  private nextRowAt = DIFFICULTY.START_GRACE_DISTANCE;
  private protectedLane: number | null = null;
  private rowCounter = 0;

  nextPowerUpKind: PowerUpKind | null = null; // rolled per row, read by Game on pickup

  constructor(
    private scene: THREE.Scene,
    private env: EnvironmentFactory,
  ) {
    this.coinPool = new ObjectPool<Coin>(
      () => {
        const coin = new Coin(env.buildCoin());
        this.scene.add(coin.mesh);
        return coin;
      },
      undefined,
      (c) => c.deactivate(),
      260,
    );
    for (const kind of ['magnet', 'shield', 'multiplier', 'jet'] as PowerUpKind[]) {
      this.powerupPools.set(
        kind,
        new ObjectPool<PowerUp>(
          () => {
            const pu = new PowerUp(kind, env.buildPowerUp(kind));
            this.scene.add(pu.group);
            return pu;
          },
          undefined,
          (p) => p.deactivate(),
          6,
        ),
      );
    }
  }

  private obstaclePool(kind: ObstacleKind, variant: number): ObjectPool<Obstacle> {
    const key = `${kind}-${variant}`;
    let pool = this.obstaclePools.get(key);
    if (!pool) {
      pool = new ObjectPool<Obstacle>(
        () => {
          const ob = new Obstacle(kind, variant, this.env.buildObstacle(kind, variant));
          this.scene.add(ob.group);
          return ob;
        },
        undefined,
        (o) => o.deactivate(),
        kind === 'train' ? 4 : 24,
      );
      this.obstaclePools.set(key, pool);
    }
    return pool;
  }

  reset(seed: number): void {
    for (const o of this.obstacles) this.obstaclePool(o.kind, o.variant).release(o);
    for (const c of this.coins) this.coinPool.release(c);
    for (const p of this.powerups) this.powerupPools.get(p.kind)?.release(p);
    this.obstacles = [];
    this.coins = [];
    this.powerups = [];
    this.rng = mulberry32(seed);
    this.nextRowAt = DIFFICULTY.START_GRACE_DISTANCE;
    this.protectedLane = null;
    this.rowCounter = 0;
    this.nextPowerUpKind = null;
  }

  getSeedDebugInfo(): { nextRowAt: number; rows: number } {
    return { nextRowAt: this.nextRowAt, rows: this.rowCounter };
  }

  update(dt: number, dz: number, ctx: SpawnContext, time: number): void {
    this.scheduleRows(ctx);
    this.moveEntities(dt, dz, ctx, time);
  }

  // ------------------------------------------------------------ scheduling

  private scheduleRows(ctx: SpawnContext): void {
    let guard = 0;
    while (
      ctx.distance + WORLD.SPAWN_DISTANCE >= this.nextRowAt &&
      guard++ < 8
    ) {
      const z = -(this.nextRowAt - ctx.distance);
      const row = planRow(this.rng, ctx.stage, this.protectedLane);
      this.spawnRow(row, z);

      // Power-up chance per row.
      if (this.rng() < POWERUPS.SPAWN_CHANCE) {
        const lanes = passableLanes(row);
        const lane = lanes[Math.floor(this.rng() * lanes.length) % lanes.length];
        const kinds: PowerUpKind[] = ['magnet', 'shield', 'multiplier', 'jet'];
        const kind = kinds[Math.floor(this.rng() * kinds.length) % kinds.length];
        this.spawnPowerUp(kind, laneToX(lane), z - 12);
      }

      // Fairness: remember the open lane after forced switches.
      if (row.forcedSwitch) {
        const lanes = passableLanes(row);
        this.protectedLane = lanes.length > 0 ? lanes[0] : null;
      } else {
        this.protectedLane = null;
      }

      let gap = ctx.rowGap * randRange(this.rng, 0.85, 1.15);
      if (row.forcedSwitch) gap += DIFFICULTY.POST_SWITCH_GRACE;
      this.nextRowAt += gap;
      this.rowCounter++;
    }
  }

  private spawnRow(row: SpawnRow, z: number): void {
    const variant = this.rowCounter % 2;
    for (const spec of row.obstacles) {
      const pool = this.obstaclePool(spec.kind, variant);
      const ob = pool.acquire();
      const lengthScale =
        spec.kind === 'train' ? randRange(this.rng, 0.85, 1.2) : 1;
      ob.place(spec.lane, z, lengthScale);
      this.obstacles.push(ob);
    }
    this.spawnCoins(row, z);
  }

  private spawnCoins(row: SpawnRow, z: number): void {
    if (row.coinPattern === 'none' || row.coinLane === null) return;
    const laneX = laneToX(row.coinLane);
    const hasOverhead = row.obstacles.some(
      (o) => o.lane === row.coinLane && o.kind === 'overhead',
    );
    switch (row.coinPattern) {
      case 'line':
        this.coinLine(laneX, z, 5, hasOverhead ? 0.72 : 0.95);
        break;
      case 'arc':
        this.coinArc(laneX, z, 7);
        break;
      case 'zigzag':
        this.coinZigzag(laneX, z, 7);
        break;
      case 'switch':
        this.coinSwitch(row, laneX, z);
        break;
      case 'leadin':
        this.coinLine(laneX, z + COIN_SPACING * 2, 6, 0.95, COIN_SPACING);
        break;
    }
  }

  private addCoin(x: number, y: number, z: number): void {
    const coin = this.coinPool.acquire();
    coin.place(x, y, z);
    this.coins.push(coin);
  }

  private coinLine(x: number, z: number, count: number, y: number, spacing = COIN_SPACING): void {
    for (let i = 0; i < count; i++) {
      this.addCoin(x, y, z + (i - (count - 1) / 2) * spacing);
    }
  }

  private coinArc(x: number, z: number, count: number): void {
    const span = (count - 1) * COIN_SPACING;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 0.62 + Math.sin(t * Math.PI) * 1.72;
      this.addCoin(x, y, z + (t - 0.5) * span);
    }
  }

  private coinZigzag(x: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const offset = Math.sin(i * 1.35) * 0.55;
      this.addCoin(x + offset, 0.95, z + (i - (count - 1) / 2) * COIN_SPACING);
    }
  }

  private coinSwitch(row: SpawnRow, x: number, z: number): void {
    const lanes = passableLanes(row).filter((l) => laneToX(l) !== x);
    if (lanes.length === 0) {
      this.coinLine(x, z, 5, 0.95);
      return;
    }
    const target = lanes[Math.floor(this.rng() * lanes.length) % lanes.length];
    for (let i = 0; i < 3; i++) this.addCoin(x, 0.95, z + (2 - i) * COIN_SPACING);
    for (let i = 0; i < 4; i++) {
      this.addCoin(laneToX(target), 0.95, z - (i + 1) * COIN_SPACING);
    }
  }

  private spawnPowerUp(kind: PowerUpKind, x: number, z: number): void {
    const pool = this.powerupPools.get(kind);
    if (!pool) return;
    const pu = pool.acquire();
    pu.place(x, z);
    this.powerups.push(pu);
  }

  // --------------------------------------------------------------- movement

  private moveEntities(dt: number, dz: number, ctx: SpawnContext, time: number): void {
    // Obstacles.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.move(dz);
      if (o.group.position.z - 12 > WORLD.DESPAWN_BEHIND) {
        this.obstaclePool(o.kind, o.variant).release(o);
        this.obstacles.splice(i, 1);
      }
    }
    // Coins (+ magnet attraction).
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.move(dz);
      c.spin(dt);
      if (ctx.magnetActive || ctx.jetActive) {
        const p = c.mesh.position;
        const dx = ctx.playerX - p.x;
        const dy = ctx.playerY + 0.9 - p.y;
        const dzp = -p.z; // player is at z=0
        const d2 = dx * dx + dy * dy + dzp * dzp;
        const radius = ctx.jetActive ? 3.2 : POWERUPS.MAGNET.radius;
        if (d2 < radius * radius || c.magnetized) {
          c.magnetized = true;
          const d = Math.sqrt(d2) || 0.001;
          const pull = Math.min(1, (18 * dt) / d);
          c.moveTo(p.x + dx * pull, p.y + dy * pull, p.z + dzp * pull);
        }
      }
      if (c.mesh.position.z > WORLD.DESPAWN_BEHIND) {
        this.coinPool.release(c);
        this.coins.splice(i, 1);
      }
    }
    // Power-ups.
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.update(dt, dz, time);
      if (p.group.position.z > WORLD.DESPAWN_BEHIND) {
        this.powerupPools.get(p.kind)?.release(p);
        this.powerups.splice(i, 1);
      }
    }
  }

  releaseCoin(coin: Coin): void {
    const idx = this.coins.indexOf(coin);
    if (idx >= 0) this.coins.splice(idx, 1);
    this.coinPool.release(coin);
  }

  releasePowerUp(pu: PowerUp): void {
    const idx = this.powerups.indexOf(pu);
    if (idx >= 0) this.powerups.splice(idx, 1);
    this.powerupPools.get(pu.kind)?.release(pu);
  }

  releaseObstacle(ob: Obstacle): void {
    const idx = this.obstacles.indexOf(ob);
    if (idx >= 0) this.obstacles.splice(idx, 1);
    this.obstaclePool(ob.kind, ob.variant).release(ob);
  }

  getActiveCount(): number {
    return this.obstacles.length + this.coins.length + this.powerups.length;
  }
}
