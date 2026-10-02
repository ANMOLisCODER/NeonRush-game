import * as THREE from 'three';
import {
  CAMERA,
  DIFFICULTY,
  LIVES,
  POWERUPS,
  QUALITY_PRESETS,
  GameSettings,
  PlayerProfile,
} from '../config/gameConfig';
import { Player } from '../entities/Player';
import { CameraSystem } from '../systems/CameraSystem';
import { CollisionSystem, aabbOverlap } from '../systems/CollisionSystem';
import { DifficultySystem } from '../systems/DifficultySystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { PowerUpTimers } from '../systems/PowerUpTimers';
import { ScoreSystem } from '../systems/ScoreSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { AudioManager } from './AudioManager';
import { InputAction, InputManager } from './InputManager';
import { GameLoop } from './GameLoop';
import { SettingsManager } from './SettingsManager';
import { StorageManager } from './StorageManager';
import { UIManager } from '../ui/UIManager';
import { EnvironmentFactory } from '../world/EnvironmentFactory';
import { TrackManager } from '../world/TrackManager';
import { World } from '../world/World';
import { GameState, PowerUpKind } from '../utils/constants';
import { formatDistance, formatScore, randomSeed } from '../utils/math';

const PU_LABELS: Record<PowerUpKind, string> = {
  magnet: POWERUPS.MAGNET.label,
  shield: POWERUPS.SHIELD.label,
  multiplier: POWERUPS.MULTIPLIER.label,
  jet: POWERUPS.JET.label,
};

/**
 * Top-level orchestrator + finite state machine:
 * boot → loading → menu ⇄ playing ⇄ paused → gameover → menu.
 * Owns every subsystem, drives the frame update and routes input/UI events.
 */
export class Game {
  private state: GameState = 'boot';
  private time = 0;
  private seed = randomSeed();
  private lives = LIVES.COUNT;
  private hudAccum = 0;
  private debugAccum = 0;
  private lastRestart = 0;
  private lastStepMultiplier = 1;
  private prevPlayerX = 0;
  private coinSfxCooldown = 0;

  private storage: StorageManager;
  private settings: SettingsManager;
  private audio: AudioManager;
  private ui: UIManager;
  private input: InputManager;
  private loop: GameLoop;

  private world: World;
  private env!: EnvironmentFactory;
  private track!: TrackManager;
  private particles!: ParticleSystem;
  private player!: Player;
  private cameraSys!: CameraSystem;
  private spawn!: SpawnSystem;

  private difficulty = new DifficultySystem();
  private score = new ScoreSystem();
  private powerups = new PowerUpTimers();

  private debugGroup: THREE.Group | null = null;
  private playerBoxHelper: THREE.LineSegments | null = null;
  private obstacleHelpers: THREE.LineSegments[] = [];
  private profile: PlayerProfile;

  constructor(canvas: HTMLCanvasElement) {
    this.storage = new StorageManager();
    this.settings = new SettingsManager(this.storage);
    this.profile = { ...this.storage.getProfile() };
    this.audio = new AudioManager(this.settings.get());

    this.world = new World(canvas, this.settings.getPreset());

    this.ui = new UIManager({
      onPlay: () => {
        this.audio.unlock();
        this.audio.play('click');
        this.startRun();
      },
      onRestart: () => {
        this.audio.unlock();
        this.audio.play('click');
        this.startRun();
      },
      onResume: () => {
        this.audio.play('click');
        this.resume();
      },
      onMainMenu: () => {
        this.audio.play('click');
        this.toMenu();
      },
      onSettingsChanged: (s) => this.applySettings(s),
      onTogglePause: () => this.togglePause(),
    });
    this.ui.adoptSettings(this.settings.get());
    this.ui.refreshProfile(this.profile);

    this.input = new InputManager(canvas, {
      onAction: (a) => this.handleAction(a),
      onFirstInteraction: () => this.audio.unlock(),
    });

    this.loop = new GameLoop(
      (dt) => this.frame(dt),
      () => this.onHidden(),
    );

    this.applySettings(this.settings.get());
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  // --------------------------------------------------------------- boot

  /** Staged async boot so the loading bar shows real progress. */
  async boot(): Promise<void> {
    try {
      this.setState('loading');
      this.ui.show('loading');
      this.loop.start();

      await this.loadStep(0.12, 'Waking the renderer…', () => {
        this.env = new EnvironmentFactory(this.settings.getPreset());
        this.debugGroup = this.buildDebugRig();
        this.world.scene.add(this.debugGroup);
      });
      await this.loadStep(0.4, 'Fabricating the city…', () => {
        // Pre-build decoration prototypes for every chunk type/variant to
        // avoid first-use hitches during play.
        const types = ['open', 'tunnel', 'station', 'market', 'bridge', 'construction'] as const;
        for (const type of types) {
          for (const variant of [0, 1]) this.env.getDecorPrototype(type, variant);
        }
      });
      await this.loadStep(0.62, 'Laying metro track…', () => {
        this.track = new TrackManager(this.world.scene, this.env, this.seed);
        this.track.build(this.settings.getPreset().chunkCount, this.seed);
      });
      await this.loadStep(0.8, 'Training the runner…', () => {
        this.player = new Player(this.settings.get().characterVariant);
        this.player.reset();
        this.world.scene.add(this.player.root);
        this.particles = new ParticleSystem(this.settings.getPreset().maxParticles);
        this.world.scene.add(this.particles.points);
        this.cameraSys = new CameraSystem(this.world.camera);
        this.spawn = new SpawnSystem(this.world.scene, this.env);
        this.cameraSys.reset();
      });
      await this.loadStep(0.92, 'Tuning neon audio…', () => {
        // AudioContext is created on first gesture; nothing heavy here.
        this.onResize();
      });
      await this.loadStep(1, 'Ready', () => undefined);

      this.toMenu();
    } catch (err) {
      console.error('[boot] fatal', err);
      this.ui.showFatal(
        `The game failed to initialise: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private loadStep(progress: number, status: string, work: () => void): Promise<void> {
    return new Promise((resolve) => {
      this.ui.setLoading(progress, status);
      // Let the browser paint the progress bar, then do the work.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            work();
          } catch (err) {
            console.error('[boot step failed]', status, err);
            throw err;
          }
          resolve();
        });
      });
    });
  }

  // -------------------------------------------------------------- state

  private setState(next: GameState): void {
    this.state = next;
    this.ui.broadcastState(next);
  }

  getState(): GameState {
    return this.state;
  }

  private toMenu(): void {
    this.setState('menu');
    this.audio.stopMusic();
    this.seed = randomSeed();
    this.track.build(this.settings.getPreset().chunkCount, this.seed);
    this.spawn.reset(this.seed);
    this.player.reset();
    this.difficulty.reset();
    this.score.reset();
    this.powerups.reset();
    this.player.shieldActive = false;
    this.player.jetActive = false;
    this.particles.clear();
    this.cameraSys.reset();
    this.profile = { ...this.storage.getProfile() };
    this.ui.refreshProfile(this.profile);
    this.ui.setPowerups([]);
    this.ui.setLives(LIVES.COUNT, LIVES.COUNT);
    this.ui.show('menu');
    this.time = 0;
  }

  private startRun(): void {
    // Debounce rapid restart clicks/keys.
    const now = performance.now();
    if (now - this.lastRestart < 250) return;
    this.lastRestart = now;

    this.seed = randomSeed();
    this.time = 0;
    this.lives = LIVES.COUNT;
    this.lastStepMultiplier = 1;
    this.prevPlayerX = 0;
    this.hudAccum = 1; // force immediate HUD push

    this.difficulty.reset();
    this.score.reset();
    this.powerups.reset();
    this.player.reset();
    this.player.setVariant(this.settings.get().characterVariant);
    this.player.shieldActive = false;
    this.player.jetActive = false;
    this.player.magnetActive = false;
    this.track.build(this.settings.getPreset().chunkCount, this.seed);
    this.spawn.reset(this.seed);
    this.particles.clear();
    this.cameraSys.reset();
    this.cameraSys.shakeEnabled = this.settings.get().cameraShake;

    this.ui.setLives(this.lives, LIVES.COUNT);
    this.ui.setPowerups([]);
    this.ui.show('hud');
    this.setState('playing');

    this.audio.unlock();
    this.audio.startMusic();
    this.audio.setMusicIntensity(false);
    this.ui.toast('RUN!', '#7dff6a');
  }

  private togglePause(): void {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.audio.stopMusic();
    this.ui.showOverlay('pause');
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.setState('playing');
    this.audio.unlock();
    this.audio.startMusic();
    this.ui.show('hud');
  }

  private gameOver(): void {
    if (this.state === 'gameover') return;
    this.setState('gameover');
    this.audio.stopMusic();
    this.audio.play('gameover');
    this.cameraSys.addShake(1.2);
    const p = this.player.root.position;
    this.particles.burst(p.x, p.y + 1, p.z, 0xff5a5a, 42, {
      speed: 7,
      life: 1.1,
      size: 0.42,
      gravity: -9,
    });
    const finalScore = this.score.getScore();
    const prevBest = this.profile.highScore;
    this.profile = this.storage.saveRunResult(
      finalScore,
      this.difficulty.getDistance(),
      this.score.getCoins(),
    );
    this.ui.refreshProfile(this.profile);
    this.ui.showGameOver({
      score: finalScore,
      highScore: this.profile.highScore,
      distance: Math.floor(this.difficulty.getDistance()),
      coins: this.score.getCoins(),
      isNewBest: finalScore > prevBest,
    });
  }

  private onHidden(): void {
    if (this.state === 'playing') this.pause();
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.world.resize(w, h);
  };

  // -------------------------------------------------------------- input

  private handleAction(action: InputAction): void {
    switch (action) {
      case 'pause': {
        // Escape also backs out of info screens.
        const screen = this.ui.getCurrentScreen();
        if (
          screen === 'howto' ||
          screen === 'concepts' ||
          screen === 'credits' ||
          screen === 'settings'
        ) {
          this.audio.play('click');
          if (screen === 'settings') {
            const btn = document.querySelector<HTMLButtonElement>('#btn-settings-back');
            btn?.click();
          } else {
            const back = document.querySelector<HTMLButtonElement>('.screen--visible [data-back]');
            back?.click();
          }
          return;
        }
        this.togglePause();
        break;
      }
      case 'debug':
        this.ui.toggleDebug();
        this.syncDebugVisibility();
        break;
      case 'restart':
        if (this.state === 'playing' || this.state === 'paused' || this.state === 'gameover') {
          this.startRun();
        }
        break;
      case 'left':
        if (this.state === 'playing' && this.player.moveLeft()) this.audio.play('click');
        break;
      case 'right':
        if (this.state === 'playing' && this.player.moveRight()) this.audio.play('click');
        break;
      case 'jump':
        if (this.state === 'playing' && this.player.jump()) {
          this.audio.play('jump');
          const p = this.player.root.position;
          this.particles.burst(p.x, p.y + 0.1, p.z, 0x9fd8ff, 8, {
            speed: 2.6,
            life: 0.4,
            size: 0.22,
            gravity: -4,
          });
        }
        break;
      case 'slide':
        if (this.state === 'playing' && this.player.slide()) {
          this.audio.play('slide');
          const p = this.player.root.position;
          this.particles.burst(p.x, p.y + 0.12, p.z + 0.2, 0xffc23c, 10, {
            speed: 3.4,
            life: 0.45,
            size: 0.2,
            gravity: -3,
            spread: 1.6,
          });
        }
        break;
    }
  }

  // -------------------------------------------------------------- frame

  private frame(dt: number): void {
    switch (this.state) {
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'paused':
        // Frozen simulation; keep rendering the last frame state.
        break;
      case 'gameover':
        // Let particles/camera settle behind the panel.
        this.time += dt;
        this.particles.update(dt);
        this.cameraSys.update(
          dt,
          this.player.root.position.x,
          this.player.root.position.y,
          this.difficulty.getSpeed(),
          0,
          this.time,
        );
        this.world.updateFollowLight(this.player.root.position.x, this.player.root.position.y);
        break;
      case 'menu':
        this.updateAttractMode(dt);
        break;
      default:
        // loading / boot: idle render
        break;
    }
    if (this.state === 'loading' || this.state === 'boot') {
      this.world.render();
      return;
    }
    this.updateDebug(dt);
    this.world.render();
  }

  private updateAttractMode(dt: number): void {
    this.time += dt;
    // Slow idle scroll + running-in-place character behind the menu.
    const dz = 7 * dt;
    this.track.update(dz);
    this.env.update(this.time);
    this.player.update(dt, 9, this.time);
    this.particles.update(dt);
    // Gentle orbiting camera.
    const cam = this.world.camera;
    const a = this.time * 0.12;
    cam.position.set(Math.sin(a) * 8.5, 4.6 + Math.sin(a * 0.7) * 0.6, Math.cos(a) * 8.5);
    cam.lookAt(0, 1.2, -6);
    cam.fov = CAMERA.FOV_BASE;
    this.world.updateFollowLight(0, 0);
  }

  private updatePlaying(dt: number): void {
    this.time += dt;

    // --- Difficulty & distance
    this.difficulty.update(dt);
    const speed = this.difficulty.getSpeed();
    const dz = speed * dt;
    this.score.addDistance(dz);

    // --- Music intensity switch at higher stages.
    this.audio.setMusicIntensity(this.difficulty.getStage() >= 5);

    // --- Multiplier step-up toast.
    const step = this.score.getStepMultiplier();
    if (step > this.lastStepMultiplier) {
      this.ui.toast(`MULTIPLIER x${step}`, '#ff4fd8');
      this.audio.play('powerup');
      this.lastStepMultiplier = step;
    } else if (step < this.lastStepMultiplier) {
      this.lastStepMultiplier = step;
    }

    // --- Power-up timers + sync flags onto the player.
    const events = this.powerups.update(dt);
    for (const ev of events) {
      if (ev.type === 'expired') {
        this.ui.toast(`${PU_LABELS[ev.kind]} ENDED`, '#9aa3c7');
        if (ev.kind === 'jet') this.player.jetActive = false;
      }
    }
    this.player.magnetActive = this.powerups.isActive('magnet');
    this.player.shieldActive = this.powerups.isActive('shield');
    if (!this.powerups.isActive('jet') && this.player.jetActive) {
      this.player.jetActive = false;
    }

    // --- Player.
    this.player.update(dt, speed, this.time);
    if (this.player.justLanded) {
      this.player.justLanded = false;
      this.cameraSys.addLandingDip(1);
      const p = this.player.root.position;
      this.particles.burst(p.x, p.y + 0.08, p.z, 0x8f9bbd, 10, {
        speed: 3,
        life: 0.4,
        size: 0.24,
        gravity: -6,
        spread: 1.4,
      });
    }
    this.player.justJumped = false;
    this.player.justSlid = false;

    // Multiplier sparkles while the x2 power-up is live.
    if (this.powerups.isActive('multiplier') && Math.random() < 0.35) {
      const p = this.player.root.position;
      this.particles.spawn(
        p.x + (Math.random() - 0.5) * 1.2,
        p.y + 0.4 + Math.random() * 1.4,
        p.z + (Math.random() - 0.5) * 0.6,
        POWERUPS.MULTIPLIER.color,
        { speed: 0.8, life: 0.5, size: 0.16, gravity: 1.5, spread: 0.5 },
      );
    }

    // Jet exhaust trail.
    if (this.player.jetActive) {
      const p = this.player.root.position;
      this.particles.spawn(p.x, p.y - 0.05, p.z + 0.25, 0x7dff6a, {
        speed: 1.4,
        life: 0.35,
        size: 0.3,
        gravity: -1.5,
        upwardBias: -2.5,
        spread: 0.4,
      });
      this.particles.spawn(p.x, p.y - 0.05, p.z + 0.25, 0x39d0ff, {
        speed: 1.2,
        life: 0.3,
        size: 0.24,
        gravity: -1,
        upwardBias: -3,
        spread: 0.4,
      });
    }

    // --- World scroll.
    this.track.update(dz);
    this.env.update(this.time);
    this.spawn.update(
      dt,
      dz,
      {
        distance: this.difficulty.getDistance(),
        speed,
        stage: this.difficulty.getStage(),
        rowGap: this.difficulty.getRowGap(),
        playerX: this.player.root.position.x,
        playerY: this.player.root.position.y,
        magnetActive: this.player.magnetActive,
        jetActive: this.player.jetActive,
      },
      this.time,
    );

    // --- Collisions.
    this.handleCollisions(dt, speed);

    // --- Particles + camera.
    this.particles.update(dt);
    const px = this.player.root.position.x;
    const lateralVel = dt > 0 ? (px - this.prevPlayerX) / dt : 0;
    this.prevPlayerX = px;
    this.cameraSys.update(dt, px, this.player.root.position.y, speed, lateralVel, this.time);
    this.world.updateFollowLight(px, this.player.root.position.y);

    // --- HUD (throttled to ~12 Hz to keep DOM work cheap).
    this.hudAccum += dt;
    if (this.hudAccum >= 0.08) {
      this.hudAccum = 0;
      this.ui.updateHud({
        score: this.score.getScore(),
        highScore: Math.max(this.profile.highScore, this.score.getScore()),
        coins: this.score.getCoins(),
        distance: this.difficulty.getDistance(),
        multiplier: this.score.getMultiplier(this.powerups.isActive('multiplier')),
      });
      this.ui.setPowerups(this.powerups.getActive());
    }
    if (this.coinSfxCooldown > 0) this.coinSfxCooldown -= dt;
  }

  private handleCollisions(dt: number, _speed: number): void {
    void dt;
    const pbox = this.player.getAABB();
    const px = this.player.root.position.x;
    const py = this.player.root.position.y;

    // Coins.
    for (let i = this.spawn.coins.length - 1; i >= 0; i--) {
      const coin = this.spawn.coins[i];
      if (!coin.active) continue;
      if (aabbOverlap(pbox, coin.box)) {
        this.score.addCoin();
        if (this.coinSfxCooldown <= 0) {
          this.audio.play('coin');
          this.coinSfxCooldown = 0.045;
        }
        this.particles.burst(
          coin.mesh.position.x,
          coin.mesh.position.y,
          coin.mesh.position.z,
          0xffc23c,
          6,
          { speed: 3.2, life: 0.45, size: 0.22, gravity: -5 },
        );
        this.spawn.releaseCoin(coin);
      }
    }

    // Power-ups.
    for (let i = this.spawn.powerups.length - 1; i >= 0; i--) {
      const pu = this.spawn.powerups[i];
      if (!pu.active) continue;
      if (aabbOverlap(pbox, pu.box)) {
        this.activatePowerUp(pu.kind);
        this.particles.burst(
          pu.group.position.x,
          pu.group.position.y,
          pu.group.position.z,
          this.powerUpColor(pu.kind),
          16,
          { speed: 4.5, life: 0.7, size: 0.3, gravity: -3 },
        );
        this.spawn.releasePowerUp(pu);
      }
    }

    // Obstacles — jet boost flies over everything.
    if (this.player.jetActive || this.player.isInvincible()) return;
    const hitIndex = CollisionSystem.findObstacleHit(pbox, this.spawn.obstacles);
    if (hitIndex >= 0) {
      this.handleObstacleHit(px, py);
    }
  }

  private handleObstacleHit(px: number, py: number): void {
    if (this.player.shieldActive && this.powerups.consumeShield()) {
      this.player.shieldActive = false;
      this.audio.play('shieldbreak');
      this.cameraSys.addShake(0.4);
      this.particles.burst(px, py + 0.9, 0, 0x39d0ff, 26, {
        speed: 6,
        life: 0.6,
        size: 0.3,
        gravity: -4,
      });
      this.ui.toast('SHIELD ABSORBED HIT', '#39d0ff');
      this.player.onHit(); // brief invincibility so we don't re-trigger
      return;
    }
    this.lives -= 1;
    this.score.onHit();
    this.player.onHit();
    this.audio.play('hit');
    this.cameraSys.addShake(1);
    this.particles.burst(px, py + 0.9, 0, 0xff5a5a, 22, {
      speed: 6,
      life: 0.7,
      size: 0.34,
      gravity: -8,
    });
    this.ui.setLives(Math.max(0, this.lives), LIVES.COUNT);
    if (this.lives <= 0) {
      this.gameOver();
    } else {
      this.ui.toast(`OUCH! ${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, '#ff5a5a');
    }
  }

  private activatePowerUp(kind: PowerUpKind): void {
    this.powerups.activate(kind);
    this.audio.play('powerup');
    if (kind === 'jet') {
      this.player.jetActive = true;
      this.player.jump(); // visually launches (harmless if it fails)
    }
    this.ui.toast(`${PU_LABELS[kind]} ONLINE`, this.powerUpCssColor(kind));
  }

  private powerUpColor(kind: PowerUpKind): number {
    switch (kind) {
      case 'magnet':
        return POWERUPS.MAGNET.color;
      case 'shield':
        return POWERUPS.SHIELD.color;
      case 'multiplier':
        return POWERUPS.MULTIPLIER.color;
      case 'jet':
        return POWERUPS.JET.color;
    }
  }

  private powerUpCssColor(kind: PowerUpKind): string {
    return `#${this.powerUpColor(kind).toString(16).padStart(6, '0')}`;
  }

  // -------------------------------------------------------------- debug

  /** Lightweight test/console hooks (also handy during viva demos). */
  debugLane(): number {
    return this.player.getLane();
  }

  debugPlayerY(): number {
    return this.player.root.position.y;
  }

  debugSliding(): boolean {
    return this.player.isSliding();
  }

  debugSnapshot(): {
    state: GameState;
    score: number;
    coins: number;
    distance: number;
    speed: number;
    stage: number;
    lives: number;
    obstacles: number;
    coinsActive: number;
    powerups: number;
    activePowerups: number;
    particles: number;
    seed: number;
  } {
    return {
      state: this.state,
      score: this.score.getScore(),
      coins: this.score.getCoins(),
      distance: this.difficulty.getDistance(),
      speed: this.difficulty.getSpeed(),
      stage: this.difficulty.getStage(),
      lives: this.lives,
      obstacles: this.spawn.obstacles.length,
      coinsActive: this.spawn.coins.length,
      powerups: this.spawn.powerups.length,
      activePowerups: this.powerups.getActive().length,
      particles: this.particles.getActiveCount(),
      seed: this.seed,
    };
  }

  private buildDebugRig(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'debug-rig';
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.playerBoxHelper = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x7dff6a, depthTest: false, transparent: true }),
    );
    this.playerBoxHelper.visible = false;
    group.add(this.playerBoxHelper);
    for (let i = 0; i < 8; i++) {
      const helper = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xff5a5a, depthTest: false, transparent: true, opacity: 0.85 }),
      );
      helper.visible = false;
      this.obstacleHelpers.push(helper);
      group.add(helper);
    }
    group.visible = false;
    return group;
  }

  private syncDebugVisibility(): void {
    const on = this.ui.isDebugVisible();
    if (this.debugGroup) this.debugGroup.visible = on;
    if (this.playerBoxHelper) this.playerBoxHelper.visible = on;
    for (const h of this.obstacleHelpers) h.visible = false;
  }

  private updateDebug(dt: number): void {
    const showFps = this.settings.get().showFps;
    const debugOn = this.ui.isDebugVisible();
    if (!debugOn && !showFps) {
      if (this.debugGroup?.visible) this.syncDebugVisibility();
      return;
    }
    if (this.debugGroup) this.debugGroup.visible = debugOn;

    this.debugAccum += dt;
    if (this.debugAccum < 0.2) return;
    this.debugAccum = 0;

    if (debugOn && this.player && this.playerBoxHelper) {
      const box = this.player.getAABB();
      this.playerBoxHelper.visible = true;
      this.playerBoxHelper.scale.set(
        box.maxX - box.minX,
        box.maxY - box.minY,
        box.maxZ - box.minZ,
      );
      this.playerBoxHelper.position.set(
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        (box.minZ + box.maxZ) / 2,
      );
      // Nearby obstacle boxes.
      const near = this.spawn
        ? this.spawn.obstacles
            .filter((o) => o.active && Math.abs(o.group.position.z) < 45)
            .slice(0, this.obstacleHelpers.length)
        : [];
      for (let i = 0; i < this.obstacleHelpers.length; i++) {
        const helper = this.obstacleHelpers[i];
        const ob = near[i];
        if (!ob) {
          helper.visible = false;
          continue;
        }
        helper.visible = true;
        const b = ob.box;
        helper.scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
        helper.position.set(
          (b.minX + b.maxX) / 2,
          (b.minY + b.maxY) / 2,
          (b.minZ + b.maxZ) / 2,
        );
      }
    }

    const chunk = this.track?.getCurrentChunk();
    const spawnInfo = this.spawn?.getSeedDebugInfo();
    const lines = debugOn
      ? [
          `FPS            ${this.loop.fps}`,
          `State          ${this.state}`,
          `Speed          ${this.difficulty.getSpeed().toFixed(1)} m/s`,
          `Distance       ${formatDistance(this.difficulty.getDistance())}`,
          `Lane           ${this.player?.getLane() ?? '-'}  (x=${this.player ? this.player.root.position.x.toFixed(2) : '-'})`,
          `Score          ${formatScore(this.score.getScore())}  x${this.score.getMultiplier(this.powerups.isActive('multiplier'))}`,
          `Stage          ${this.difficulty.getStage()}/${DIFFICULTY.MAX_STAGE}`,
          `Row gap        ${this.difficulty.getRowGap().toFixed(1)} m`,
          `Entities       obs=${this.spawn?.obstacles.length ?? 0} coins=${this.spawn?.coins.length ?? 0} pu=${this.spawn?.powerups.length ?? 0}`,
          `Particles      ${this.particles?.getActiveCount() ?? 0}`,
          `World objects  ${this.world.scene.children.length} root / ${this.track?.getActiveObjectCount() ?? 0} in chunks`,
          `Chunk          #${chunk?.id ?? '-'} (${chunk?.type ?? '-'})`,
          `Rows spawned   ${spawnInfo?.rows ?? 0}  next@${(spawnInfo?.nextRowAt ?? 0).toFixed(0)}m`,
          `Seed           ${this.seed}`,
          `Power-ups      ${this.powerups.getActive().map((p) => `${p.kind}:${p.remaining.toFixed(1)}s`).join(' ') || 'none'}`,
          `Lives          ${this.lives}`,
        ]
      : [`FPS ${this.loop.fps}`];
    this.ui.setDebugText(lines.join('\n'));
  }

  // ----------------------------------------------------------- settings

  private applySettings(s: GameSettings): void {
    this.settings.update(s);
    const preset = QUALITY_PRESETS[s.quality];
    this.audio.applySettings(s);
    if (this.cameraSys) this.cameraSys.shakeEnabled = s.cameraShake;
    this.world.applyQuality(preset, this.settings.effectivePixelRatio());
    if (this.env) this.env.setPreset(preset);
    if (this.particles) this.particles.resize(preset.maxParticles);
    if (this.player) this.player.setVariant(s.characterVariant);
    // Chunk ring only rebuilt outside active play to avoid mid-run pops.
    if (this.track && this.state !== 'playing') {
      this.track.build(preset.chunkCount, this.seed);
    }
    this.ui.adoptSettings(s);
    this.syncDebugVisibility();
  }

  // ------------------------------------------------------------ teardown

  dispose(): void {
    this.loop.destroy();
    this.input.destroy();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.audio.dispose();
    this.particles?.dispose();
    this.player?.dispose();
    this.track?.clear();
    this.env?.dispose();
    this.world.dispose();
  }
}
