/**
 * Shared constants and small types used across systems.
 */

/** Top-level game states. */
export type GameState =
  | 'boot'
  | 'loading'
  | 'menu'
  | 'playing'
  | 'paused'
  | 'gameover';

/** The kinds of obstacles the spawn system can emit. */
export type ObstacleKind = 'low' | 'overhead' | 'tall' | 'train';

export type PowerUpKind = 'magnet' | 'shield' | 'multiplier' | 'jet';

export type ChunkType =
  | 'open'
  | 'tunnel'
  | 'station'
  | 'market'
  | 'bridge'
  | 'construction';

/** Events emitted on the shared DOM event bus (keeps UI decoupled from game). */
export const GAME_EVENTS = {
  STATE_CHANGED: 'nmr:state',
  HUD: 'nmr:hud',
  GAME_OVER: 'nmr:gameover',
  POWERUP_CHANGED: 'nmr:powerup',
  LIVES_CHANGED: 'nmr:lives',
  SETTINGS_CHANGED: 'nmr:settings',
  TOAST: 'nmr:toast',
} as const;

/** One row of spawned hazards. Produced by the pure pattern planner. */
export interface SpawnRow {
  /** Obstacles in this row. */
  obstacles: SpawnRowObstacle[];
  /** Coin pattern laid alongside the row (may be empty). */
  coinPattern: CoinPatternKind;
  /** Lane the coin pattern focuses on (-1..1), or null for none. */
  coinLane: number | null;
  /** True when this row forces a lane switch (triggers grace gap after). */
  forcedSwitch: boolean;
}

export interface SpawnRowObstacle {
  lane: number; // -1 | 0 | 1
  kind: ObstacleKind;
}

export type CoinPatternKind =
  | 'none'
  | 'line'
  | 'arc'
  | 'zigzag'
  | 'switch'
  | 'leadin';

/** Axis-aligned bounding box used by the collision system. */
export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Collision + visual dimensions per obstacle kind (metres).
 * `y` is the bottom of the box. Values are deliberately matched to the
 * visible meshes built in EnvironmentFactory.
 */
export const OBSTACLE_DIMS = {
  low: { w: 1.9, h: 0.95, d: 0.7, y: 0 },
  overhead: { w: 2.1, h: 1.0, d: 0.6, y: 1.12 },
  tall: { w: 1.95, h: 2.7, d: 1.0, y: 0 },
  train: { w: 2.15, h: 3.0, d: 16, y: 0 },
} as const;

export const COIN_RADIUS = 0.36;
export const POWERUP_RADIUS = 0.55;
