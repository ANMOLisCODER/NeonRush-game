import { ChunkType } from '../utils/constants';

/**
 * Chooses the next chunk type for the endless track.
 *
 * Pure + seedable so a run's environment layout is reproducible from its
 * seed (printed in the F3 debug overlay). Rules keep variety high:
 *  - never the same type more than twice in a row,
 *  - tunnels never directly after tunnels (claustrophobia control),
 *  - early chunks are gentle ("open") to ease the player in.
 */

const ALL_TYPES: ChunkType[] = [
  'open',
  'tunnel',
  'station',
  'market',
  'bridge',
  'construction',
];

export class ChunkGenerator {
  private history: ChunkType[] = [];

  constructor(private rng: () => number) {}

  reset(seed: number): void {
    this.rng = seedRng(seed);
    this.history = [];
  }

  next(index: number): ChunkType {
    if (index < 3) {
      // Graceful start on open track.
      const type: ChunkType = 'open';
      this.history.push(type);
      return type;
    }
    const prev = this.history[this.history.length - 1];
    const prev2 = this.history[this.history.length - 2];
    let candidates = ALL_TYPES.filter((t) => {
      if (t === prev && t === prev2) return false; // no 3-in-a-row
      if (t === 'tunnel' && prev === 'tunnel') return false;
      return true;
    });
    if (candidates.length === 0) candidates = ALL_TYPES;
    const type = candidates[Math.floor(this.rng() * candidates.length) % candidates.length];
    this.history.push(type);
    return type;
  }

  /** Variant index (0/1) so two chunks of the same type look different. */
  nextVariant(): number {
    return Math.floor(this.rng() * 2);
  }
}

function seedRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Validate a chunk sequence never violates the variety rules (unit tests).
 * The first three chunks are the intentional 'open' grace start and are
 * therefore exempt from the no-3-in-a-row rule.
 */
export function isSequenceValid(seq: ChunkType[]): boolean {
  for (let i = 3; i < seq.length; i++) {
    if (seq[i] === seq[i - 1] && seq[i] === seq[i - 2]) return false;
    if (seq[i] === 'tunnel' && seq[i - 1] === 'tunnel') return false;
  }
  return true;
}
