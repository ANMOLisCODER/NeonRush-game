import { describe, expect, it } from 'vitest';
import {
  emptyLanes,
  isCoinPatternSafe,
  isRowPassable,
  passableLanes,
  planRow,
} from '../src/systems/PatternPlanner';
import { mulberry32 } from '../src/utils/math';

describe('PatternPlanner fairness', () => {
  it('every generated row across all stages is passable (fuzz, 6000 rows)', () => {
    const rng = mulberry32(12345);
    for (let stage = 1; stage <= 8; stage++) {
      for (let i = 0; i < 750; i++) {
        const row = planRow(rng, stage);
        expect(isRowPassable(row), `stage ${stage} row ${i}: ${JSON.stringify(row)}`).toBe(true);
      }
    }
  });

  it('never blocks all three lanes with impassable obstacles', () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 3000; i++) {
      const row = planRow(rng, 8);
      expect(passableLanes(row).length).toBeGreaterThan(0);
    }
  });

  it('never stacks two obstacles in the same lane of a row', () => {
    const rng = mulberry32(4242);
    for (let i = 0; i < 3000; i++) {
      const row = planRow(rng, 6);
      const lanes = row.obstacles.map((o) => o.lane);
      expect(new Set(lanes).size).toBe(lanes.length);
    }
  });

  it('rows requiring an action keep a single clearable action', () => {
    const rng = mulberry32(777);
    for (let i = 0; i < 3000; i++) {
      const row = planRow(rng, 7);
      if (emptyLanes(row).length === 0) {
        const kinds = new Set(row.obstacles.map((o) => o.kind));
        expect(kinds.size).toBe(1);
        const kind = [...kinds][0];
        expect(['low', 'overhead']).toContain(kind);
      }
    }
  });

  it('coin patterns never sit in impassable lanes', () => {
    const rng = mulberry32(31337);
    let withCoins = 0;
    for (let i = 0; i < 4000; i++) {
      const row = planRow(rng, 5);
      expect(isCoinPatternSafe(row)).toBe(true);
      if (row.coinPattern !== 'none') withCoins++;
    }
    expect(withCoins).toBeGreaterThan(1000); // patterns are actually produced
  });

  it('forced-switch rows are flagged and only produced from stage 4+', () => {
    const rngLow = mulberry32(11);
    for (let i = 0; i < 800; i++) {
      const row = planRow(rngLow, 3);
      expect(row.forcedSwitch).toBe(false);
    }
    const rngHigh = mulberry32(22);
    let switches = 0;
    for (let i = 0; i < 800; i++) {
      if (planRow(rngHigh, 6).forcedSwitch) switches++;
    }
    expect(switches).toBeGreaterThan(0);
  });

  it('protected lane always stays passable (post-switch fairness)', () => {
    for (const lane of [-1, 0, 1]) {
      const rng = mulberry32(555 + lane);
      for (let i = 0; i < 1200; i++) {
        const row = planRow(rng, 8, lane);
        expect(isRowPassable(row)).toBe(true);
        expect(passableLanes(row)).toContain(lane);
        // A protected row never chains another forced switch.
        expect(row.forcedSwitch).toBe(false);
      }
    }
  });

  it('same seed produces identical rows (reproducible debugging)', () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    for (let i = 0; i < 100; i++) {
      expect(planRow(a, 5)).toEqual(planRow(b, 5));
    }
  });
});
