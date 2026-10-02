import './styles/main.css';
import { Game } from './core/Game';
import { UIManager } from './ui/UIManager';

/**
 * Entry point: verify WebGL support, then boot the game.
 * Any failure surfaces a friendly full-screen message instead of a blank page.
 */

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

function showFatal(message: string): void {
  const screen = document.querySelector<HTMLElement>('#screen-fatal');
  const msg = document.querySelector<HTMLElement>('#fatal-message');
  const loading = document.querySelector<HTMLElement>('#screen-loading');
  if (msg) msg.textContent = message;
  if (loading) loading.style.display = 'none';
  if (screen) {
    screen.classList.add('screen--visible');
    screen.style.display = 'flex';
  }
}

async function main(): Promise<void> {
  if (!webglAvailable()) {
    showFatal(
      'WebGL is not available on this device or browser. Enable hardware acceleration or try a modern browser (Chrome, Edge, Firefox, Safari 15+).',
    );
    return;
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (!canvas) {
    showFatal('Game canvas is missing from the page.');
    return;
  }

  try {
    const game = new Game(canvas);
    // Expose for console-based manual testing / coursework demos.
    (window as unknown as { nmrGame: Game; UIManager: typeof UIManager }).nmrGame = game;
    await game.boot();
  } catch (err) {
    console.error('[nmr] fatal boot error', err);
    showFatal(
      `The game failed to start: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Last-resort guard so unexpected errors are visible but not silent.
  window.addEventListener('error', (e) => {
    console.error('[nmr] uncaught error', e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[nmr] unhandled rejection', e.reason);
  });
}

void main();
