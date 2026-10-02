/**
 * Central game configuration.
 * Every tunable gameplay / visual value lives here so balancing does not
 * require touching system code (single source of truth).
 */

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Max devicePixelRatio multiplier used by the renderer. */
  pixelRatioCap: number;
  /** Enable real-time shadow mapping. */
  shadows: boolean;
  /** Shadow map resolution (px). */
  shadowMapSize: number;
  /** Camera far plane (draw distance) in world units. */
  drawDistance: number;
  /** Fog far distance in world units. */
  fogFar: number;
  /** Max simultaneous particles. */
  maxParticles: number;
  /** Decorative props density multiplier (0..1). */
  decorDensity: number;
  /** Number of recycled track chunks kept in memory. */
  chunkCount: number;
  /** Antialiasing on the drawing buffer. */
  antialias: boolean;
}

export const QUALITY_PRESETS: Record<GraphicsQuality, QualityPreset> = {
  low: {
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 512,
    drawDistance: 160,
    fogFar: 110,
    maxParticles: 120,
    decorDensity: 0.4,
    chunkCount: 7,
    antialias: false,
  },
  medium: {
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    drawDistance: 240,
    fogFar: 170,
    maxParticles: 260,
    decorDensity: 0.75,
    chunkCount: 9,
    antialias: true,
  },
  high: {
    pixelRatioCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    drawDistance: 340,
    fogFar: 260,
    maxParticles: 480,
    decorDensity: 1,
    chunkCount: 12,
    antialias: true,
  },
};

export const DEFAULT_SETTINGS = {
  quality: 'medium' as GraphicsQuality,
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  muted: false,
  cameraShake: true,
  showFps: false,
  characterVariant: 0,
};

export type GameSettings = typeof DEFAULT_SETTINGS;

/** Lane configuration — exactly three primary lanes. */
export const LANE = {
  COUNT: 3,
  WIDTH: 2.4,
  /** Lane indices: -1 (left), 0 (center), 1 (right). */
  MIN_INDEX: -1,
  MAX_INDEX: 1,
} as const;

/** Lane index -> world X position. */
export function laneToX(index: number): number {
  return index * LANE.WIDTH;
}

export const PLAYER = {
  START_X: 0,
  /** Player stays at z=0; the world scrolls towards +z (treadmill model). */
  FIXED_Z: 0,
  BASE_Y: 0.05,
  WIDTH: 0.72,
  HEIGHT_STAND: 1.72,
  HEIGHT_SLIDE: 0.75,
  DEPTH: 0.62,
  /** Horizontal lerp responsiveness for lane changes. */
  LANE_LERP_SPEED: 12,
  JUMP_VELOCITY: 9.2,
  GRAVITY: -26,
  SLIDE_DURATION: 0.62,
  /** Post-hit invincibility time (seconds). */
  INVINCIBLE_TIME: 2.0,
  MAX_LEAN_ANGLE: 0.38,
} as const;

export const DIFFICULTY = {
  /** Metres per second at game start. */
  START_SPEED: 13,
  /** Hard cap on speed so the game stays fair. */
  MAX_SPEED: 34,
  /** Speed gained per second of survival. */
  SPEED_RAMP: 0.16,
  /** Distance between obstacle rows at start (m). */
  START_ROW_GAP: 34,
  /** Minimum row gap at max difficulty (m). */
  MIN_ROW_GAP: 18,
  /** Difficulty stages 1..N; each stage unlocks richer patterns. */
  MAX_STAGE: 8,
  /** Distance (m) required per difficulty stage. */
  METERS_PER_STAGE: 260,
  /** Grace distance with no obstacles after a run starts (m). */
  START_GRACE_DISTANCE: 60,
  /** Minimum reaction gap kept after a forced lane-switch pattern (m). */
  POST_SWITCH_GRACE: 14,
} as const;

export const SCORE = {
  /** Points per metre travelled. */
  POINTS_PER_METER: 1.0,
  /** Points per coin. */
  POINTS_PER_COIN: 12,
  /** Base multiplier. */
  BASE_MULTIPLIER: 1,
  /** Max multiplier reached by clean play. */
  MAX_MULTIPLIER: 5,
  /** Metres of clean running per +1 multiplier. */
  METERS_PER_MULTIPLIER_STEP: 220,
  /** Multiplier granted by the x2 power-up (stacks additively on top). */
  POWERUP_MULTIPLIER_BONUS: 2,
} as const;

export const POWERUPS = {
  MAGNET: { duration: 8, radius: 8.5, label: 'MAGNET', color: 0xffc23c },
  SHIELD: { duration: 12, label: 'SHIELD', color: 0x39d0ff },
  MULTIPLIER: { duration: 10, label: 'x2 SCORE', color: 0xff4fd8 },
  JET: { duration: 6, label: 'JET BOOST', color: 0x7dff6a },
  /** Chance (0..1) that a row also spawns a power-up pickup. */
  SPAWN_CHANCE: 0.085,
} as const;

export const LIVES = {
  COUNT: 3,
} as const;

export const WORLD = {
  CHUNK_LENGTH: 34,
  TRACK_WIDTH: LANE.WIDTH * 3 + 1.6,
  /** How far ahead (in metres) entities spawn. */
  SPAWN_DISTANCE: 170,
  /** Entities beyond this distance behind the player are recycled. */
  DESPAWN_BEHIND: 14,
  GROUND_Y: 0,
} as const;

export const CAMERA = {
  FOV_BASE: 62,
  FOV_MAX: 76,
  /** Camera offset relative to the player. */
  OFFSET_Y: 4.1,
  OFFSET_Z: 7.6,
  /** How strongly the camera tracks lateral player movement (0..1). */
  LATERAL_FOLLOW: 0.55,
  LOOK_AHEAD_Z: -9,
  POSITION_LERP: 5.2,
  SHAKE_MAGNITUDE: 0.42,
  SHAKE_DECAY: 4.5,
  LANDING_DIP: 0.35,
} as const;

export const STORAGE_KEYS = {
  SETTINGS: 'nmr.settings.v1',
  PROFILE: 'nmr.profile.v1',
} as const;

export interface PlayerProfile {
  highScore: number;
  bestDistance: number;
  totalCoins: number;
  runs: number;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  highScore: 0,
  bestDistance: 0,
  totalCoins: 0,
  runs: 0,
};

/** Fictional neon signage copy — 100% original, no real brands. */
export const NEON_SIGN_TEXTS = [
  'CHAI POINT 2077',
  'नमस्ते METRO',
  'MASALA BYTE',
  'RAAGA RECORDS',
  'DHABA-9',
  'JUGNU LIGHTS',
  'SAAWN CAFÉ',
  'रंगोली ARCADE',
  'TANDUR TECH',
  'BINDAAS BAZAAR',
  'CHOWK STATION',
  'HAAT ONLINE',
  'मिर्च NOODLES',
  'VYOM TRAVELS',
  'SULTAN SWEETS',
  'JHILMIL JUNCTION',
] as const;

export const HOLO_AD_TEXTS = [
  'SKY-RICKSHAW\nNOW WITH TURBO',
  'NEEM-2000\nAIR PURE HOLO-FILTER',
  'DOSA DRONE\nDELIVERY IN 9 MIN',
  'METRO PASS\nRIDES FOREVER',
  'CHAI BOT\nHOT. SWEET. LOYAL.',
  'SARI SYNTH\nFABRIC OF TOMORROW',
] as const;

/** Original playable-character colour variants. */
export interface CharacterVariant {
  name: string;
  jacket: number;
  pants: number;
  skin: number;
  visor: number;
  accent: number;
  hair: number;
}

export const CHARACTER_VARIANTS: readonly CharacterVariant[] = [
  {
    name: 'Saffron Storm',
    jacket: 0xff9a3c,
    pants: 0x1c2340,
    skin: 0xc68642,
    visor: 0x39d0ff,
    accent: 0xffd166,
    hair: 0x14121f,
  },
  {
    name: 'Magenta Monsoon',
    jacket: 0xff4fd8,
    pants: 0x241c40,
    skin: 0x8d5524,
    visor: 0x7dff6a,
    accent: 0x39d0ff,
    hair: 0x201a2e,
  },
  {
    name: 'Indigo Ember',
    jacket: 0x5a6bff,
    pants: 0x16182c,
    skin: 0xe0ac69,
    visor: 0xff6a5a,
    accent: 0xffc23c,
    hair: 0x101018,
  },
];
