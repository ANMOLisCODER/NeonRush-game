/**
 * Unified input: keyboard + touch swipes + on-screen buttons.
 * Emits high-level actions so gameplay never touches raw events.
 * Prevents browser scrolling / pull-to-refresh on game gestures.
 */

export type InputAction =
  | 'left'
  | 'right'
  | 'jump'
  | 'slide'
  | 'pause'
  | 'restart'
  | 'debug';

export interface InputHandlers {
  onAction: (action: InputAction) => void;
  /** First user gesture — used to unlock Web Audio. */
  onFirstInteraction?: () => void;
}

const SWIPE_MIN_DISTANCE = 34;
const SWIPE_MAX_DURATION = 650;

export class InputManager {
  private touchStartX = 0;
  private touchStartY = 0;
  private touchLastX = 0;
  private touchLastY = 0;
  private touchStartTime = 0;
  private touchId: number | null = null;
  private firstInteractionDone = false;
  private enabled = true;

  constructor(
    private element: HTMLElement,
    private handlers: InputHandlers,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    element.addEventListener('touchstart', this.onTouchStart, { passive: false });
    element.addEventListener('touchmove', this.onTouchMove, { passive: false });
    element.addEventListener('touchend', this.onTouchEnd, { passive: false });
    element.addEventListener('touchcancel', this.onTouchCancel, { passive: false });
    // Block page scroll / rubber-banding while the game has focus.
    element.addEventListener(
      'wheel',
      (e) => e.preventDefault(),
      { passive: false },
    );
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.element.removeEventListener('touchstart', this.onTouchStart);
    this.element.removeEventListener('touchmove', this.onTouchMove);
    this.element.removeEventListener('touchend', this.onTouchEnd);
    this.element.removeEventListener('touchcancel', this.onTouchCancel);
  }

  private markInteraction(): void {
    if (!this.firstInteractionDone) {
      this.firstInteractionDone = true;
      this.handlers.onFirstInteraction?.();
    }
  }

  private emit(action: InputAction): void {
    this.markInteraction();
    if (this.enabled) this.handlers.onAction(action);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Never hijack modifier shortcuts or text fields.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this.emit('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        this.emit('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault();
        this.emit('jump');
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.emit('slide');
        break;
      case 'KeyP':
      case 'Escape':
        e.preventDefault();
        this.emit('pause');
        break;
      case 'KeyR':
        e.preventDefault();
        this.emit('restart');
        break;
      case 'F3':
        e.preventDefault();
        this.emit('debug');
        break;
      default:
        break;
    }
  };

  private onTouchStart = (e: TouchEvent): void => {
    this.markInteraction();
    if (this.touchId !== null) return;
    const touch = e.changedTouches[0];
    this.touchId = touch.identifier;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchLastX = touch.clientX;
    this.touchLastY = touch.clientY;
    this.touchStartTime = performance.now();
  };

  private onTouchMove = (e: TouchEvent): void => {
    // Stop the page from scrolling / pull-to-refresh while swiping.
    if (e.cancelable) e.preventDefault();
    if (this.touchId === null) return;
    const touch = Array.from(e.touches).find((t) => t.identifier === this.touchId);
    if (touch) {
      this.touchLastX = touch.clientX;
      this.touchLastY = touch.clientY;
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (this.touchId === null) return;
    const touch = Array.from(e.changedTouches).find(
      (t) => t.identifier === this.touchId,
    );
    // Some synthetic / cancelled touch streams report an empty
    // changedTouches list on touchend — fall back to the last known point.
    const endX = touch ? touch.clientX : this.touchLastX;
    const endY = touch ? touch.clientY : this.touchLastY;
    this.touchId = null;

    const dx = endX - this.touchStartX;
    const dy = endY - this.touchStartY;
    const dt = performance.now() - this.touchStartTime;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (dt > SWIPE_MAX_DURATION) return;
    if (Math.max(adx, ady) < SWIPE_MIN_DISTANCE) {
      // Treat a tap as a jump on the play surface (common runner convention),
      // but only during gameplay — UI buttons stop propagation.
      this.emit('jump');
      return;
    }
    if (adx > ady) {
      this.emit(dx > 0 ? 'right' : 'left');
    } else {
      this.emit(dy > 0 ? 'slide' : 'jump');
    }
  };

  private onTouchCancel = (): void => {
    this.touchId = null;
  };
}
