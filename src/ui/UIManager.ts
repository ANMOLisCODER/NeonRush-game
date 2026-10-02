import {
  CHARACTER_VARIANTS,
  DEFAULT_SETTINGS,
  GameSettings,
  GraphicsQuality,
  PlayerProfile,
} from '../config/gameConfig';
import { ActivePowerUpState } from '../systems/PowerUpTimers';
import { GameState, GAME_EVENTS, PowerUpKind } from '../utils/constants';
import { formatDistance, formatScore } from '../utils/math';

export type ScreenName =
  | 'loading'
  | 'menu'
  | 'hud'
  | 'pause'
  | 'gameover'
  | 'howto'
  | 'concepts'
  | 'settings'
  | 'credits'
  | 'fatal';

export interface UICallbacks {
  onPlay: () => void;
  onRestart: () => void;
  onResume: () => void;
  onMainMenu: () => void;
  onSettingsChanged: (settings: GameSettings) => void;
  onTogglePause: () => void;
}

export interface GameOverStats {
  score: number;
  highScore: number;
  distance: number;
  coins: number;
  isNewBest: boolean;
}

const PU_META: Record<PowerUpKind, { icon: string; color: string }> = {
  magnet: { icon: 'U', color: '#ffc23c' },
  shield: { icon: '◈', color: '#39d0ff' },
  multiplier: { icon: 'x2', color: '#ff4fd8' },
  jet: { icon: '▲', color: '#7dff6a' },
};

const CONCEPTS: Array<{ title: string; body: string }> = [
  {
    title: 'Translation · Rotation · Scaling',
    body: 'Every frame the track chunks translate towards the camera (<code>position.z += v·Δt</code>), coins rotate and bob, and lane changes translate the player on X. All meshes are built from a shared unit box scaled per instance — scaling as a modelling tool.',
  },
  {
    title: 'Hierarchical transformations',
    body: 'The runner is a scene graph: hips → torso → head/arms, hips → thighs → shins. Rotating a thigh pivot carries the shin and shoe with it — local matrices composed into world space by Three.js.',
  },
  {
    title: 'Perspective projection',
    body: 'A PerspectiveCamera builds the projection matrix from FOV, aspect, near and far planes. The FOV widens from 62° to 76° as speed rises, intensifying the sense of velocity.',
  },
  {
    title: 'Camera (view) transformations',
    body: 'The follow camera is a damped look-at transform: position lerps behind the player, a look-ahead target frames the action, and lane changes add a subtle roll around the view axis.',
  },
  {
    title: 'Texture mapping & UVs',
    body: 'All textures are drawn procedurally into 2D canvases (signage, train livery, windows, hazard stripes) and mapped through UV coordinates, with RepeatWrapping tiling the deck texture along the track.',
  },
  {
    title: 'Lighting model',
    body: 'A hemisphere light fakes sky/ground bounce, one directional "moon" casts shadows, and exactly two point lights provide neon rim-lighting — a deliberately small light budget.',
  },
  {
    title: 'Materials & shading',
    body: 'MeshStandardMaterial (metalness/roughness PBR) shades characters and props; MeshBasicMaterial drives unlit neon emissives; a custom ShaderMaterial powers the particle cloud.',
  },
  {
    title: 'Real-time shadow mapping',
    body: 'The moon light renders depth from its POV into a 1–2k shadow map (quality dependent), sampled during shading with PCF soft filtering and bias tuning to avoid acne/peter-panning.',
  },
  {
    title: 'Fog & depth cueing',
    body: 'Linear fog blends distant geometry into the night sky colour, hiding the chunk recycle point and adding aerial perspective. Fog range is a graphics-quality knob.',
  },
  {
    title: 'Alpha blending',
    body: 'The shield bubble, holograms and particles use transparent/additive blending with depthWrite disabled so overlapping glow layers composite correctly.',
  },
  {
    title: 'Particle systems',
    body: 'One THREE.Points cloud with custom vertex/fragment shaders animates hundreds of pooled particles (coin bursts, landing dust, jet flames) entirely on the CPU with typed arrays — zero per-frame allocation.',
  },
  {
    title: 'Collision detection',
    body: 'Axis-aligned bounding boxes with a Z-axis broad phase. Player pose changes the box (standing 1.72 m vs sliding 0.75 m) so jumps clear low barriers and slides pass overhead signs.',
  },
  {
    title: 'Procedural generation',
    body: 'A seeded PRNG (mulberry32) drives chunk types, obstacle rows, coin patterns and decoration. Templates are fairness-validated: at least one lane is always passable, and forced switches get grace gaps.',
  },
  {
    title: 'Object pooling',
    body: 'Track chunks, obstacles, coins, power-ups and particles are never created or destroyed mid-run — they are acquired from pools, repositioned, and released back when they fall behind the camera.',
  },
  {
    title: 'Instancing & LOD-style optimisation',
    body: 'InstancedMesh draws sleepers, skyline buildings and market lights in single draw calls. Quality presets scale pixel ratio, shadow resolution, fog/draw distance, decor density and particle caps — distance-based visual budgeting.',
  },
  {
    title: 'Frame-time animation',
    body: 'All motion integrates with clamped delta time (≤ 50 ms), keeping speeds identical on 30 Hz phones and 144 Hz monitors; exponential damping makes easing frame-rate independent.',
  },
  {
    title: 'Tone mapping & colour space',
    body: 'ACES filmic tone mapping compresses HDR-ish neon emissives into displayable range, and sRGB output colour space keeps canvas textures and lighting physically consistent.',
  },
  {
    title: 'Procedural audio synthesis',
    body: 'Music and every SFX are synthesised live with the Web Audio API (oscillators, noise buffers, biquad filters) — the game ships no audio files at all.',
  },
];

/**
 * Owns every DOM interaction: screens, HUD, settings form, toasts and the
 * debug overlay. Rendering code never touches the DOM directly, keeping UI
 * and simulation decoupled (communicating via callbacks + CustomEvents).
 */
export class UIManager {
  private el = {
    screens: {} as Record<ScreenName, HTMLElement>,
    loadingBar: this.must('#loading-bar'),
    loadingStatus: this.must('#loading-status'),
    fatalMessage: this.must('#fatal-message'),
    hudScore: this.must('#hud-score'),
    hudHigh: this.must('#hud-highscore'),
    hudCoins: this.must('#hud-coins'),
    hudDistance: this.must('#hud-distance'),
    hudMultiplier: this.must('#hud-multiplier'),
    hudLives: this.must('#hud-lives'),
    hudPowerups: this.must('#hud-powerups'),
    toastContainer: this.must('#toast-container'),
    menuHigh: this.must('#menu-highscore'),
    menuCoins: this.must('#menu-coins'),
    menuDistance: this.must('#menu-distance'),
    goScore: this.must('#go-score'),
    goHigh: this.must('#go-highscore'),
    goDistance: this.must('#go-distance'),
    goCoins: this.must('#go-coins'),
    goNewBest: this.must('#go-newbest'),
    debug: this.must('#debug-overlay'),
    setMaster: this.must('#set-master') as HTMLInputElement,
    setMasterVal: this.must('#set-master-val'),
    setMusic: this.must('#set-music') as HTMLInputElement,
    setMusicVal: this.must('#set-music-val'),
    setSfx: this.must('#set-sfx') as HTMLInputElement,
    setSfxVal: this.must('#set-sfx-val'),
    setShake: this.must('#set-shake') as HTMLInputElement,
    setFps: this.must('#set-fps') as HTMLInputElement,
    setMute: this.must('#set-mute') as HTMLInputElement,
    qualityButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('#set-quality button')),
    variantsRow: this.must('#set-variants'),
    conceptsList: this.must('#concepts-list'),
    btnFullscreen: this.must('#btn-fullscreen'),
  };

  private currentScreen: ScreenName = 'loading';
  private settingsOrigin: ScreenName = 'menu';
  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private puChips = new Map<PowerUpKind, HTMLElement>();
  private debugVisible = false;

  constructor(private callbacks: UICallbacks) {
    const names: ScreenName[] = [
      'loading', 'menu', 'hud', 'pause', 'gameover', 'howto', 'concepts', 'settings', 'credits', 'fatal',
    ];
    for (const name of names) {
      const node = this.must(`#screen-${name}`);
      this.el.screens[name] = node;
    }
    this.wireButtons();
    this.buildConcepts();
    this.buildVariants();
    this.wireSettings();
  }

  private must(selector: string): HTMLElement {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) throw new Error(`Missing UI element: ${selector}`);
    return node;
  }

  // ---------------------------------------------------------- screens

  private setScreenVisibility(visible: Set<ScreenName>): void {
    for (const key of Object.keys(this.el.screens) as ScreenName[]) {
      const node = this.el.screens[key];
      if (key === 'hud') {
        node.classList.toggle('hud--visible', visible.has('hud'));
        continue;
      }
      const on = visible.has(key);
      node.classList.toggle('screen--visible', on);
      node.style.display = on ? 'flex' : 'none';
    }
  }

  show(name: ScreenName): void {
    this.setScreenVisibility(new Set([name]));
    this.currentScreen = name;
  }

  /** HUD shows together with pause/gameover overlays layered above it. */
  showOverlay(name: ScreenName): void {
    this.setScreenVisibility(new Set(['hud', name]));
    this.currentScreen = name;
  }

  getCurrentScreen(): ScreenName {
    return this.currentScreen;
  }

  private wireButtons(): void {
    const click = (id: string, fn: () => void) => {
      const btn = this.must(id);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      btn.addEventListener('touchend', (e) => e.stopPropagation());
    };
    click('#btn-play', () => this.callbacks.onPlay());
    click('#btn-restart', () => this.callbacks.onRestart());
    click('#btn-pause-restart', () => this.callbacks.onRestart());
    click('#btn-resume', () => this.callbacks.onResume());
    click('#btn-pause', () => this.callbacks.onTogglePause());
    click('#btn-pause-menu', () => this.callbacks.onMainMenu());
    click('#btn-gameover-menu', () => this.callbacks.onMainMenu());
    click('#btn-howto', () => this.showScreenFrom('howto', 'menu'));
    click('#btn-concepts', () => this.showScreenFrom('concepts', 'menu'));
    click('#btn-credits', () => this.showScreenFrom('credits', 'menu'));
    click('#btn-settings', () => this.showScreenFrom('settings', 'menu'));
    click('#btn-pause-settings', () => this.showScreenFrom('settings', 'pause'));
    click('#btn-settings-back', () => this.returnFromSettings());

    document.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = btn.getAttribute('data-back');
        if (target === 'menu') {
          if (this.settingsOrigin === 'pause') this.showOverlay('pause');
          else this.show('menu');
        }
      });
    });

    click('#btn-fullscreen', () => this.toggleFullscreen());
  }

  private showScreenFrom(name: ScreenName, origin: ScreenName): void {
    if (name === 'settings') this.settingsOrigin = origin;
    if (origin === 'pause') this.showOverlay(name);
    else this.show(name);
  }

  private returnFromSettings(): void {
    if (this.settingsOrigin === 'pause') this.showOverlay('pause');
    else this.show('menu');
  }

  // ----------------------------------------------------------- loading

  setLoading(progress: number, status: string): void {
    this.el.loadingBar.style.width = `${Math.round(progress * 100)}%`;
    this.el.loadingStatus.textContent = status;
  }

  showFatal(message: string): void {
    this.el.fatalMessage.textContent = message;
    this.show('fatal');
  }

  // --------------------------------------------------------------- HUD

  updateHud(data: {
    score: number;
    highScore: number;
    coins: number;
    distance: number;
    multiplier: number;
  }): void {
    this.el.hudScore.textContent = formatScore(data.score);
    this.el.hudHigh.textContent = formatScore(data.highScore);
    this.el.hudCoins.textContent = String(data.coins);
    this.el.hudDistance.textContent = formatDistance(data.distance);
    this.el.hudMultiplier.textContent = `x${data.multiplier}`;
  }

  setLives(lives: number, max: number): void {
    const hearts = this.el.hudLives.querySelectorAll('.life');
    hearts.forEach((h, i) => {
      h.classList.toggle('spent', i >= lives);
      h.textContent = i < max ? '♥' : '';
    });
    // Ensure the right number of heart elements exists.
    while (this.el.hudLives.children.length < max) {
      const span = document.createElement('span');
      span.className = 'life';
      span.textContent = '♥';
      this.el.hudLives.appendChild(span);
    }
  }

  setPowerups(active: ActivePowerUpState[]): void {
    const seen = new Set<PowerUpKind>();
    for (const state of active) {
      seen.add(state.kind);
      let chip = this.puChips.get(state.kind);
      if (!chip) {
        chip = this.buildPuChip(state.kind);
        this.puChips.set(state.kind, chip);
        this.el.hudPowerups.appendChild(chip);
      }
      const fill = chip.querySelector<HTMLElement>('.pu-bar-fill');
      if (fill) {
        fill.style.width = `${(state.remaining / state.duration) * 100}%`;
      }
      const nameEl = chip.querySelector<HTMLElement>('.pu-name');
      if (nameEl) {
        nameEl.textContent = `${state.kind.toUpperCase()} ${state.remaining.toFixed(1)}s`;
      }
      chip.classList.toggle('expiring', state.remaining < 2);
    }
    for (const [kind, chip] of this.puChips) {
      if (!seen.has(kind)) {
        chip.remove();
        this.puChips.delete(kind);
      }
    }
  }

  private buildPuChip(kind: PowerUpKind): HTMLElement {
    const meta = PU_META[kind];
    const chip = document.createElement('div');
    chip.className = 'pu-chip';
    chip.innerHTML = `
      <div class="pu-icon" style="background:${meta.color};box-shadow:0 0 10px ${meta.color}">${meta.icon}</div>
      <div class="pu-meta">
        <span class="pu-name" style="color:${meta.color}">${kind.toUpperCase()}</span>
        <div class="pu-bar-track"><div class="pu-bar-fill" style="background:${meta.color};width:100%"></div></div>
      </div>`;
    return chip;
  }

  toast(text: string, color = '#39d0ff'): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.color = color;
    toast.style.borderColor = color;
    toast.textContent = text;
    this.el.toastContainer.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1700);
    // Cap simultaneous toasts.
    while (this.el.toastContainer.children.length > 3) {
      this.el.toastContainer.firstElementChild?.remove();
    }
  }

  // ---------------------------------------------------------- game over

  showGameOver(stats: GameOverStats): void {
    this.el.goScore.textContent = formatScore(stats.score);
    this.el.goHigh.textContent = formatScore(stats.highScore);
    this.el.goDistance.textContent = formatDistance(stats.distance);
    this.el.goCoins.textContent = String(stats.coins);
    this.el.goNewBest.classList.toggle('hidden', !stats.isNewBest);
    this.showOverlay('gameover');
  }

  refreshProfile(profile: PlayerProfile): void {
    this.el.menuHigh.textContent = formatScore(profile.highScore);
    this.el.menuCoins.textContent = formatScore(profile.totalCoins);
    this.el.menuDistance.textContent = formatDistance(profile.bestDistance);
  }

  // ---------------------------------------------------------- settings

  private wireSettings(): void {
    const sliders: Array<[HTMLInputElement, HTMLElement, keyof GameSettings]> = [
      [this.el.setMaster, this.el.setMasterVal, 'masterVolume'],
      [this.el.setMusic, this.el.setMusicVal, 'musicVolume'],
      [this.el.setSfx, this.el.setSfxVal, 'sfxVolume'],
    ];
    for (const [input, label, key] of sliders) {
      input.addEventListener('input', () => {
        const v = Number(input.value) / 100;
        label.textContent = `${input.value}%`;
        this.settings = { ...this.settings, [key]: v };
        this.callbacks.onSettingsChanged(this.settings);
      });
    }
    const toggles: Array<[HTMLInputElement, keyof GameSettings]> = [
      [this.el.setShake, 'cameraShake'],
      [this.el.setFps, 'showFps'],
      [this.el.setMute, 'muted'],
    ];
    for (const [input, key] of toggles) {
      input.addEventListener('change', () => {
        this.settings = { ...this.settings, [key]: input.checked };
        this.callbacks.onSettingsChanged(this.settings);
      });
    }
    for (const btn of this.el.qualityButtons) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const q = btn.getAttribute('data-quality') as GraphicsQuality;
        this.settings = { ...this.settings, quality: q };
        this.syncSettingsControls();
        this.callbacks.onSettingsChanged(this.settings);
      });
    }
  }

  private buildVariants(): void {
    CHARACTER_VARIANTS.forEach((variant: { name: string; jacket: number; pants: number }, i: number) => {
      const swatch = document.createElement('button');
      swatch.className = 'variant-swatch';
      swatch.title = variant.name;
      swatch.setAttribute('aria-label', variant.name);
      swatch.style.background = `radial-gradient(circle at 32% 30%, #${variant.jacket.toString(16).padStart(6, '0')}, #${variant.pants.toString(16).padStart(6, '0')})`;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this.settings = { ...this.settings, characterVariant: i };
        this.syncSettingsControls();
        this.callbacks.onSettingsChanged(this.settings);
      });
      this.el.variantsRow.appendChild(swatch);
    });
  }

  /** Push external settings state into the controls (single source: SettingsManager). */
  syncSettingsControls(): void {
    this.el.setMaster.value = String(Math.round(this.settings.masterVolume * 100));
    this.el.setMasterVal.textContent = `${this.el.setMaster.value}%`;
    this.el.setMusic.value = String(Math.round(this.settings.musicVolume * 100));
    this.el.setMusicVal.textContent = `${this.el.setMusic.value}%`;
    this.el.setSfx.value = String(Math.round(this.settings.sfxVolume * 100));
    this.el.setSfxVal.textContent = `${this.el.setSfx.value}%`;
    this.el.setShake.checked = this.settings.cameraShake;
    this.el.setFps.checked = this.settings.showFps;
    this.el.setMute.checked = this.settings.muted;
    for (const btn of this.el.qualityButtons) {
      btn.classList.toggle('active', btn.getAttribute('data-quality') === this.settings.quality);
    }
    const swatches = this.el.variantsRow.querySelectorAll('.variant-swatch');
    swatches.forEach((s, i) => s.classList.toggle('active', i === this.settings.characterVariant));
  }

  adoptSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.syncSettingsControls();
  }

  private toggleFullscreen(): void {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {
          this.toast('Fullscreen unavailable', '#ff5a5a');
        });
      } else {
        document.exitFullscreen?.().catch(() => undefined);
      }
    } catch {
      this.toast('Fullscreen unavailable', '#ff5a5a');
    }
  }

  // ---------------------------------------------------------- concepts

  private buildConcepts(): void {
    for (const concept of CONCEPTS) {
      const card = document.createElement('div');
      card.className = 'concept-card';
      card.innerHTML = `<h3>${concept.title}</h3><p>${concept.body}</p>`;
      this.el.conceptsList.appendChild(card);
    }
  }

  // ------------------------------------------------------------- debug

  setDebugText(text: string): void {
    this.el.debug.textContent = text;
  }

  setDebugVisible(visible: boolean, showFps: boolean): void {
    this.debugVisible = visible;
    this.el.debug.classList.toggle('hidden', !(visible || showFps));
  }

  isDebugVisible(): boolean {
    return this.debugVisible;
  }

  toggleDebug(): boolean {
    this.setDebugVisible(!this.debugVisible, this.settings.showFps);
    return this.debugVisible;
  }

  /** Notify other modules about a state transition (audio, input gating). */
  broadcastState(state: GameState): void {
    window.dispatchEvent(new CustomEvent(GAME_EVENTS.STATE_CHANGED, { detail: state }));
  }
}
