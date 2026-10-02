import { POWERUPS } from '../config/gameConfig';
import { PowerUpKind } from '../utils/constants';

export interface ActivePowerUpState {
  kind: PowerUpKind;
  remaining: number;
  duration: number;
}

export interface PowerUpEvent {
  kind: PowerUpKind;
  type: 'activated' | 'expired';
}

const DURATIONS: Record<PowerUpKind, number> = {
  magnet: POWERUPS.MAGNET.duration,
  shield: POWERUPS.SHIELD.duration,
  multiplier: POWERUPS.MULTIPLIER.duration,
  jet: POWERUPS.JET.duration,
};

/**
 * Pure power-up timer bookkeeping: activation, refresh, countdown and
 * expiry events. Rendering/HUD subscribe to the returned event list.
 */
export class PowerUpTimers {
  private remaining: Partial<Record<PowerUpKind, number>> = {};

  reset(): void {
    this.remaining = {};
  }

  /** Activate (or refresh) a power-up. Returns events for listeners. */
  activate(kind: PowerUpKind): PowerUpEvent[] {
    const fresh = !this.isActive(kind);
    this.remaining[kind] = DURATIONS[kind];
    return [{ kind, type: fresh ? 'activated' : 'activated' }];
  }

  isActive(kind: PowerUpKind): boolean {
    return (this.remaining[kind] ?? 0) > 0;
  }

  getRemaining(kind: PowerUpKind): number {
    return this.remaining[kind] ?? 0;
  }

  getDuration(kind: PowerUpKind): number {
    return DURATIONS[kind];
  }

  /** Advance all timers; returns the list of power-ups that just expired. */
  update(dt: number): PowerUpEvent[] {
    const events: PowerUpEvent[] = [];
    for (const kind of Object.keys(this.remaining) as PowerUpKind[]) {
      const value = this.remaining[kind];
      if (value === undefined || value <= 0) continue;
      const next = value - dt;
      if (next <= 0) {
        delete this.remaining[kind];
        events.push({ kind, type: 'expired' });
      } else {
        this.remaining[kind] = next;
      }
    }
    return events;
  }

  /** Snapshot for HUD rendering (stable order). */
  getActive(): ActivePowerUpState[] {
    const order: PowerUpKind[] = ['magnet', 'shield', 'multiplier', 'jet'];
    const out: ActivePowerUpState[] = [];
    for (const kind of order) {
      const value = this.remaining[kind];
      if (value && value > 0) {
        out.push({ kind, remaining: value, duration: DURATIONS[kind] });
      }
    }
    return out;
  }

  /** Shield is charge-like: consuming it removes the effect immediately. */
  consumeShield(): boolean {
    if (this.isActive('shield')) {
      delete this.remaining['shield'];
      return true;
    }
    return false;
  }
}
