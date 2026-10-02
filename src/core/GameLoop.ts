/**
 * Fixed-owner requestAnimationFrame loop with:
 *  - delta time in seconds, clamped to avoid physics explosions after tab
 *    switches or hitches (max 50 ms simulated per frame),
 *  - automatic "interrupt" callback when the document becomes hidden so the
 *    game can pause itself,
 *  - FPS tracking for the HUD / debug overlay.
 */
export class GameLoop {
  private rafId = 0;
  private lastTime = 0;
  private running = false;

  /** Rolling FPS (updated twice per second to stay cheap). */
  private frames = 0;
  private fpsAccum = 0;
  fps = 0;

  /** Largest delta we ever simulate (seconds). */
  static readonly MAX_DELTA = 0.05;

  constructor(
    private readonly onFrame: (dt: number) => void,
    private readonly onHidden?: () => void,
  ) {
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  isRunning(): boolean {
    return this.running;
  }

  destroy(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.onHidden?.();
      // Reset the clock so returning to the tab does not inject a huge delta.
      this.lastTime = performance.now();
    }
  };

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    const rawDt = dt;
    dt = Math.min(dt, GameLoop.MAX_DELTA);

    // FPS bookkeeping uses *real* frame time (not the clamped simulation dt),
    // so the meter stays honest even when frames take longer than MAX_DELTA.
    this.frames++;
    this.fpsAccum += rawDt;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsAccum);
      this.frames = 0;
      this.fpsAccum = 0;
    }

    this.onFrame(dt);
  };
}
