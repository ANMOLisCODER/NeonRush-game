import {
  CoinPatternKind,
  ObstacleKind,
  SpawnRow,
  SpawnRowObstacle,
} from '../utils/constants';

/**
 * Pure obstacle / coin pattern planner.
 *
 * Guarantees (verified by unit tests over thousands of seeds):
 *  - Never blocks all three lanes with impassable ("tall"/"train") obstacles.
 *  - If every lane holds an obstacle, they are all jumpable ("low") or all
 *    slideable ("overhead"), so a single input always clears the row.
 *  - Never stacks two obstacles in the same lane of one row.
 *  - Rows that force a lane switch are flagged so the spawn system adds an
 *    extra grace gap afterwards (no unfair instant follow-ups).
 */

type TemplateId =
  | 'single-low'
  | 'double-low'
  | 'single-overhead'
  | 'double-overhead'
  | 'tall-switch'
  | 'train'
  | 'mixed-low-overhead'
  | 'tall-plus-low';

/** Which templates each difficulty stage may use. */
const STAGE_TEMPLATES: Readonly<Record<number, readonly TemplateId[]>> = {
  1: ['single-low'],
  2: ['single-low', 'single-overhead', 'double-low'],
  3: ['single-low', 'single-overhead', 'double-low', 'mixed-low-overhead'],
  4: ['single-low', 'single-overhead', 'double-low', 'double-overhead', 'mixed-low-overhead', 'tall-switch'],
  5: ['single-low', 'double-low', 'single-overhead', 'double-overhead', 'mixed-low-overhead', 'tall-switch', 'tall-plus-low'],
  6: ['double-low', 'double-overhead', 'mixed-low-overhead', 'tall-switch', 'tall-plus-low', 'train'],
  7: ['double-low', 'double-overhead', 'mixed-low-overhead', 'tall-switch', 'tall-plus-low', 'train'],
  8: ['double-low', 'double-overhead', 'mixed-low-overhead', 'tall-switch', 'tall-plus-low', 'train'],
};

const LANES = [-1, 0, 1] as const;

function shuffledLanes(rng: () => number): number[] {
  const lanes: number[] = [...LANES];
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}

function buildTemplate(template: TemplateId, rng: () => number): SpawnRowObstacle[] {
  const lanes = shuffledLanes(rng);
  const obs: SpawnRowObstacle[] = [];
  switch (template) {
    case 'single-low':
      obs.push({ lane: lanes[0], kind: 'low' });
      break;
    case 'double-low':
      obs.push({ lane: lanes[0], kind: 'low' }, { lane: lanes[1], kind: 'low' });
      break;
    case 'single-overhead':
      obs.push({ lane: lanes[0], kind: 'overhead' });
      break;
    case 'double-overhead':
      obs.push(
        { lane: lanes[0], kind: 'overhead' },
        { lane: lanes[1], kind: 'overhead' },
      );
      break;
    case 'tall-switch':
      obs.push({ lane: lanes[0], kind: 'tall' }, { lane: lanes[1], kind: 'tall' });
      break;
    case 'train':
      obs.push({ lane: lanes[0], kind: 'train' });
      break;
    case 'mixed-low-overhead':
      obs.push(
        { lane: lanes[0], kind: 'low' },
        { lane: lanes[1], kind: 'overhead' },
      );
      break;
    case 'tall-plus-low':
      obs.push({ lane: lanes[0], kind: 'tall' }, { lane: lanes[1], kind: 'low' });
      break;
  }
  return obs;
}

/** Lanes that a player can occupy when passing this row (no tall/train). */
export function passableLanes(row: SpawnRow): number[] {
  const blocked = new Set(
    row.obstacles
      .filter((o) => o.kind === 'tall' || o.kind === 'train')
      .map((o) => o.lane),
  );
  return LANES.filter((l) => !blocked.has(l));
}

/** Lanes that are completely empty in this row. */
export function emptyLanes(row: SpawnRow): number[] {
  const occupied = new Set(row.obstacles.map((o) => o.lane));
  return LANES.filter((l) => !occupied.has(l));
}

/**
 * Fairness validation: a row is passable when at least one lane has no
 * impassable obstacle AND (that lane is empty OR every obstacle in the row
 * shares a single clearable action — all jumpable or all slideable).
 */
export function isRowPassable(row: SpawnRow): boolean {
  const passable = passableLanes(row);
  if (passable.length === 0) return false;

  const free = emptyLanes(row);
  if (free.some((l) => passable.includes(l))) return true;

  // No empty passable lane: the player must clear obstacles with one action.
  const kinds = new Set(
    row.obstacles.filter((o) => passable.includes(o.lane)).map((o) => o.kind),
  );
  if (kinds.size === 0) return true;
  if (kinds.size === 1) {
    const kind: ObstacleKind = [...kinds][0];
    return kind === 'low' || kind === 'overhead';
  }
  return false;
}

/**
 * Plan one obstacle row for the given stage. `rng` must be a seeded generator
 * (mulberry32) so runs are reproducible when debugging.
 *
 * `protectedLane` (optional): a lane that must remain passable through this
 * row. Used right after a forced lane-switch so the player is never yanked
 * back instantly (fairness rule verified in tests).
 */
export function planRow(
  rng: () => number,
  stage: number,
  protectedLane: number | null = null,
): SpawnRow {
  const clampedStage = Math.min(8, Math.max(1, Math.floor(stage)));
  const templates = STAGE_TEMPLATES[clampedStage] ?? STAGE_TEMPLATES[1];

  let obstacles: SpawnRowObstacle[] = [];
  let template: TemplateId = 'single-low';
  let attempts = 0;
  do {
    template = templates[Math.floor(rng() * templates.length) % templates.length];
    obstacles = buildTemplate(template, rng);
    attempts++;
  } while (
    protectedLane !== null &&
    attempts < 12 &&
    !laneIsPassable(obstacles, protectedLane)
  );

  // Hard fallback: a single jumpable barrier away from the protected lane.
  if (protectedLane !== null && !laneIsPassable(obstacles, protectedLane)) {
    const other = ([-1, 0, 1] as const).find((l) => l !== protectedLane) ?? 0;
    obstacles = [{ lane: other, kind: 'low' }];
    template = 'single-low';
  }

  const forcedSwitch =
    (template === 'tall-switch' || template === 'train' || template === 'tall-plus-low') &&
    protectedLane === null;

  const row: SpawnRow = {
    obstacles,
    coinPattern: 'none',
    coinLane: null,
    forcedSwitch,
  };

  planCoins(row, rng);
  return row;
}

function laneIsPassable(obstacles: SpawnRowObstacle[], lane: number): boolean {
  return !obstacles.some(
    (o) => o.lane === lane && (o.kind === 'tall' || o.kind === 'train'),
  );
}

/**
 * Choose a coin pattern that is always collectable:
 * coins are placed only in lanes without impassable obstacles; a lane holding
 * a low barrier gets a jump arc, an overhead gets a ground line (slide under
 * and sweep them), free lanes get lines / zigzags / switch paths.
 */
function planCoins(row: SpawnRow, rng: () => number): void {
  if (rng() < 0.35) {
    row.coinPattern = 'none';
    return;
  }
  const passable = passableLanes(row);
  const lane = passable[Math.floor(rng() * passable.length) % passable.length];
  const obstacleInLane = row.obstacles.find((o) => o.lane === lane);

  row.coinLane = lane;
  if (obstacleInLane?.kind === 'low') {
    row.coinPattern = 'arc';
    return;
  }
  if (obstacleInLane?.kind === 'overhead') {
    row.coinPattern = 'line';
    return;
  }
  const freeChoices: CoinPatternKind[] = ['line', 'zigzag', 'switch', 'leadin', 'arc'];
  row.coinPattern =
    freeChoices[Math.floor(rng() * freeChoices.length) % freeChoices.length];
}

/**
 * Verify a coin pattern is collectable given the row obstacles: the focused
 * lane must not contain a tall/train obstacle.
 */
export function isCoinPatternSafe(row: SpawnRow): boolean {
  if (row.coinPattern === 'none' || row.coinLane === null) return true;
  return !row.obstacles.some(
    (o) => o.lane === row.coinLane && (o.kind === 'tall' || o.kind === 'train'),
  );
}
