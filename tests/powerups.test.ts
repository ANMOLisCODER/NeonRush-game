import { describe, expect, it } from 'vitest';
import { PowerUpTimers } from '../src/systems/PowerUpTimers';
import { POWERUPS } from '../src/config/gameConfig';

describe('PowerUpTimers', () => {
  it('activates with full duration and counts down', () => {
    const t = new PowerUpTimers();
    t.activate('magnet');
    expect(t.isActive('magnet')).toBe(true);
    expect(t.getRemaining('magnet')).toBeCloseTo(POWERUPS.MAGNET.duration);
    t.update(1);
    expect(t.getRemaining('magnet')).toBeCloseTo(POWERUPS.MAGNET.duration - 1);
  });

  it('expires exactly at the end of the duration and emits an event', () => {
    const t = new PowerUpTimers();
    t.activate('shield');
    const events = t.update(POWERUPS.SHIELD.duration + 0.01);
    expect(events).toEqual([{ kind: 'shield', type: 'expired' }]);
    expect(t.isActive('shield')).toBe(false);
  });

  it('refresh replaces the remaining time (no stacking beyond duration)', () => {
    const t = new PowerUpTimers();
    t.activate('multiplier');
    t.update(POWERUPS.MULTIPLIER.duration - 1);
    t.activate('multiplier');
    expect(t.getRemaining('multiplier')).toBeCloseTo(POWERUPS.MULTIPLIER.duration);
  });

  it('tracks several concurrent effects independently', () => {
    const t = new PowerUpTimers();
    t.activate('magnet'); // 8 s
    t.activate('jet'); // 6 s
    const events = t.update(POWERUPS.JET.duration + 0.1);
    expect(events.some((e) => e.kind === 'jet' && e.type === 'expired')).toBe(true);
    expect(t.isActive('jet')).toBe(false);
    expect(t.isActive('magnet')).toBe(true);
    expect(t.getRemaining('magnet')).toBeCloseTo(
      POWERUPS.MAGNET.duration - POWERUPS.JET.duration - 0.1,
    );
  });

  it('getActive returns a stable-ordered snapshot', () => {
    const t = new PowerUpTimers();
    t.activate('jet');
    t.activate('magnet');
    const active = t.getActive().map((a) => a.kind);
    expect(active).toEqual(['magnet', 'jet']);
  });

  it('consumeShield removes the effect only when active', () => {
    const t = new PowerUpTimers();
    expect(t.consumeShield()).toBe(false);
    t.activate('shield');
    expect(t.consumeShield()).toBe(true);
    expect(t.isActive('shield')).toBe(false);
    expect(t.consumeShield()).toBe(false);
  });

  it('reset clears every timer (restart must not keep effects)', () => {
    const t = new PowerUpTimers();
    t.activate('magnet');
    t.activate('shield');
    t.activate('multiplier');
    t.activate('jet');
    t.reset();
    expect(t.getActive()).toEqual([]);
    expect(t.update(1)).toEqual([]);
  });
});
