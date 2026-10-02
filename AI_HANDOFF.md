# AI-TO-AI HANDOFF — NEON METRO RUSH (100% project context)

Read this file first. It contains everything needed to understand, run, modify,
test and deploy this codebase without any prior conversation.

---

## 1. What this project is

**Neon Metro Rush** — an original, fully playable 3D lane-based endless runner
(subway-runner genre, *no copied assets or branding*) set in a futuristic
Indian metro city at night. It is a university Computer Graphics major project
delivered as a static web app.

- Stack: **TypeScript 5.6 (strict) + Vite 5 + Three.js 0.169 + Web Audio API + Vitest 2 + ESLint 9 (flat)**. No React, no backend, no DB, no auth, no paid services, no API keys.
- All assets are **procedural**: textures drawn into 2D canvases at runtime, geometry from Three.js primitives, music/SFX synthesised with oscillators/noise buffers. Zero binary assets shipped.
- Deliverable docs in repo root: `README.md`, `PROJECT_REPORT.md` (academic), `VIVA_QUESTIONS.md` (45 Q&A), `ASSET_CREDITS.md`, `CHANGELOG.md`, `LICENSE` (MIT), `.gitignore`, `.github/workflows/deploy.yml` (GitHub Pages).

## 2. How to run (exact commands)

```bash
npm install          # deps only (three, vite, ts, eslint, vitest)
npm run dev          # dev server  → http://localhost:5173
npm run build        # tsc --noEmit && vite build → dist/  (relative base './')
npm run preview      # serve dist  → http://localhost:4173
npm run lint         # ESLint flat config, must be 0 errors
npm run test         # Vitest, 74 unit tests
npm run typecheck    # tsc --noEmit
```

Optional headless E2E (not a package dep by design):
```bash
npm i -D playwright && npx playwright install --with-deps chromium
npm run build && npm run preview &      # E2E targets http://localhost:4173
node e2e/smoke.mjs                      # full play-session gate (34 checks)
node e2e/beauty.mjs                     # re-capture docs/screenshots/*.png
```
`e2e/smoke.mjs` launches Chromium with `--use-gl=angle --use-angle=swiftshader`
so it works on GPU-less CI. It exposes checks via `window.nmrGame` debug hooks.

## 3. Validation status (as delivered, 2026-10-02)

- `npm run lint` → 0 errors. `npm run test` → 74/74 pass. `npm run build` → OK (~99 KB game JS + 482 KB three chunk; ~154 KB gzip total).
- `e2e/smoke.mjs` run against the **final production bundle**: **ALL 34 CHECKS PASSED**, including: boot→loading→menu, menu/howto/concepts/credits/settings navigation, quality persistence in localStorage, Play start, lane L/R (keys), jump (apex+landing), slide, obstacle+coin spawning, distance/score/speed ramp, collisions & life loss, F3 debug overlay content, pause (sim frozen) / resume, touch swipe, game over screen + profile persistence, restart reset (score/distance/lives/power-ups), pause→menu, persisted high score in menu, 420px-viewport no-overflow, **zero console/page errors**.
- Screenshots in `docs/screenshots/` (menu, gameplay, gameover, debug, settings, pause, mobile).

## 4. World/gameplay coordinate & model conventions (CRITICAL)

- **Forward is −Z.** The player is fixed at `z = 0` ("treadmill" model): the world (chunks, obstacles, coins, power-ups) translates toward **+Z** each frame by `dz = speed * dt`.
- Lanes: exactly 3, indices `-1 | 0 | 1`, world X = `index * LANE.WIDTH (2.4)` (`laneToX` in `src/config/gameConfig.ts`).
- Gravity jump: semi-implicit Euler, `JUMP_VELOCITY 9.2`, `GRAVITY -26` → apex ≈1.63 m clears `low` barriers (0.95 m). Slide height 0.75 m passes under `overhead` bottom edge 1.12 m; standing height 1.72 m collides with it. These numbers are **load-bearing** — tests assert them (`tests/lanes.test.ts`, `tests/collision.test.ts`).
- `dt` is clamped to 50 ms (`GameLoop.MAX_DELTA`); FPS meter uses **raw** frame time (clamped dt would lie at low FPS).
- State machine in `src/core/Game.ts`: `boot → loading → menu ⇄ playing ⇄ paused → gameover → menu`. Menu runs an attract mode (orbit camera + running-in-place character).

## 5. Directory / module map (what lives where, responsibilities)

```
src/
  config/gameConfig.ts     ALL tunables: LANE, PLAYER, DIFFICULTY, SCORE, POWERUPS,
                           LIVES, WORLD, CAMERA, STORAGE_KEYS, QUALITY_PRESETS,
                           DEFAULT_SETTINGS, CHARACTER_VARIANTS, NEON_SIGN_TEXTS…
  utils/math.ts            clamp/lerp/damp (frame-rate independent), mulberry32 seeded RNG
  utils/constants.ts       types (GameState, ObstacleKind, PowerUpKind, ChunkType, AABB),
                           OBSTACLE_DIMS (single source for collision AND visuals)
  utils/dispose.ts         recursive GPU dispose helper
  core/GameLoop.ts         rAF loop, dt clamp, honest FPS, visibilitychange → pause
  core/InputManager.ts     keyboard + touch swipes on the CANVAS element only;
                           preventDefault on game keys/gestures; touchend fallback to
                           last touchmove position (synthetic streams may omit changedTouches)
  core/AudioManager.ts     procedural Web Audio: scheduled music loop + 8 SFX; lazy
                           AudioContext created on first user gesture; all calls guarded
  core/StorageManager.ts   localStorage w/ in-memory fallback; parseProfile/parseSettings
                           sanitise hostile JSON (clamps, type checks) — unit tested
  core/SettingsManager.ts  settings state + persistence + CustomEvent broadcast
  entities/Player.ts       procedural rig (hips→torso→head/arms; hips→thighs→shins),
                           poses run/jump/slide/hit/jet, lane spring + lean, squash on
                           landing, invincibility blink, shield bubble + magnet aura meshes,
                           getAABB() pose-dependent (reused object, no alloc)
  entities/Obstacle.ts     pooled; AABB from OBSTACLE_DIMS (trains scale length 0.85–1.2×)
  entities/Coin.ts         pooled; spin; magnetized flag
  entities/PowerUp.ts      pooled; bob + ring spin
  systems/PatternPlanner.ts PURE row templates + fairness: isRowPassable(), passableLanes(),
                           protectedLane reroll + hard fallback; planCoins() per pattern
  systems/SpawnSystem.ts   distance-space row scheduler (`nextRowAt` vs travelled distance),
                           entity pools, coin pattern layout, magnet attraction, despawn
  systems/DifficultySystem.ts PURE speed ramp (13→34 m/s, +0.16/s), stages 1–8 per 260 m,
                           row gap 34→18 m
  systems/ScoreSystem.ts   PURE distance×multiplier + coin points; clean-run streak x1→x5
                           (reset on hit); +2 bonus while x2 power-up active
  systems/PowerUpTimers.ts PURE durations/expiry events; consumeShield()
  systems/CollisionSystem.ts PURE AABB + Z broad phase; findObstacleHit/findCollectibleHit
  systems/ParticleSystem.ts one THREE.Points + custom ShaderMaterial (attributes pcolor/
                           psize/palpha); typed-array pool; resize() rebuilds buffers
  systems/CameraSystem.ts  damped follow, look-ahead, FOV 62→76 with speed, roll lean,
                           decaying shake (settings-toggleable), landing dip
  systems/ObjectPool.ts    generic free-list pool w/ max cap
  world/World.ts           renderer (ACES, sRGB, PCFSoft), hemi+moon(dir, shadows)+2 point
                           lights, fog, stars, moon disc, far ground; applyQuality()
  world/TrackManager.ts    chunk ring recycling (clone decor prototypes; NEVER dispose clones)
  world/ChunkGenerator.ts  seeded chunk-type sequence w/ variety rules; isSequenceValid()
  world/EnvironmentFactory.ts cached geo/mat/tex factory; decor prototypes per type+variant;
                           obstacle/coin/powerup mesh builders; shared-material pulses
  world/Textures.ts        ALL CanvasTextures (windows, signs, holo ads, train livery,
                           stripes, tunnel tiles, coin face, particle sprite)
  ui/UIManager.ts          every DOM interaction; screens/HUD/toasts/settings/debug text
  core/Game.ts             orchestrator + FSM + collisions + debug hooks (debugSnapshot()…)
  main.ts                  WebGL capability check → friendly fatal screen; boot
index.html                 all screens as static markup (loading/fatal/menu/hud/pause/
                           gameover/howto/concepts/settings/credits + debug overlay)
src/styles/main.css        neon theme, responsive, reduced-motion support
tests/*.test.ts            9 suites / 74 tests (pure logic only, no Three.js imports)
e2e/smoke.mjs, e2e/beauty.mjs  optional Playwright gates (see §2)
```

## 6. Key algorithms & invariants (do not break)

1. **Fairness invariant** (`PatternPlanner`): a row is valid iff ≥1 lane has no `tall`/`train`
   AND (some passable lane is empty OR all passable-lane obstacles share one clearable
   action: all `low` (jump) or all `overhead` (slide)). After a forced-switch row the open
   lane becomes `protectedLane` for the next row (+`POST_SWITCH_GRACE` metres). Fuzz-tested
   over 6 000+ rows per `npm run test`.
2. **Distance-space scheduling**: rows spawn when `distance + WORLD.SPAWN_DISTANCE >= nextRowAt`;
   gap = `rowGap(progress) * rand(0.85–1.15)` (+ grace). Spacing is exact at any speed/FPS.
3. **Chunk recycling**: ring of `chunkCount` groups scrolls +Z; when a chunk is fully behind
   (`z - HALF > DESPAWN_BEHIND + 8`) it teleports to `minZ - CHUNK_LENGTH` and swaps decor by
   `clone()` of a cached prototype. Clones SHARE cached geometry/materials → **detach on
   recycle, never dispose** (only `EnvironmentFactory.dispose()` frees them).
4. **Pooling everywhere**: obstacles/coins/power-ups/particles/chunks — zero mid-run allocation.
5. **Collision honesty**: boxes derive from `OBSTACLE_DIMS`, the same constants the meshes are
   built from; player box switches with pose (stand 1.72 / slide 0.75) and lift (jump/jet).
   Jet boost skips obstacle collisions entirely (flies over) and auto-magnets coins ≤3.2 m.
6. **Lives**: 3; hit → shield absorbs first (if active) else life-- + 2 s invincibility blink;
   0 lives → gameover → `StorageManager.saveRunResult` (highScore/bestDistance/totalCoins/runs).
7. **Persistence keys**: `nmr.settings.v1`, `nmr.profile.v1` (both sanitised on read).
8. **Quality presets** (`QUALITY_PRESETS`): pixelRatioCap, shadows+mapSize, drawDistance,
   fogFar, maxParticles, decorDensity, chunkCount, antialias. Applied live via
   `Game.applySettings`; chunk ring rebuilds only outside `playing` to avoid mid-run pops.

## 7. UI/UX structure

- Screens are static markup in `index.html`; `UIManager` toggles via
  `show()` (exclusive) / `showOverlay()` (HUD + modal: pause, gameover, settings-from-pause).
- HUD updates throttled to ~12 Hz; power-up chips show icon + name + seconds + countdown bar,
  blink under 2 s; toasts for power-ups/multiplier/hits; lives as hearts.
- Settings: quality segmented control, 3 volume sliders, mute, camera shake, show FPS,
  fullscreen button, 3 character variant swatches. All persist immediately.
- Escape/P double as "back" inside info screens; F3 toggles debug overlay + live AABB helpers
  (green player box, red obstacle boxes); debug off by default.
- CSS: custom properties neon palette, clamp() typography, safe-area insets, `prefers-reduced-motion`.

## 8. Audio design

`AudioManager`: one AudioContext created on first gesture (`unlock()`); gain graph
master→(music|sfx). Music = lookahead-scheduled 32-step loop (bass saw, square arps in a
raga-flavoured scale, sine pads, noise hi-hats, sine-drop kicks); `setMusicIntensity()` shortens
step time at stage ≥5. SFX: coin (two-tone blip), jump (up-sweep), slide (band-passed noise),
powerup (arpeggiated chord), hit (kick+noise+down-sweep), shieldbreak, gameover (descending
saw), click. Every method no-ops safely if init failed (`failed` flag).

## 9. Known limitations (honest)

- Straight track only (curves would complicate fairness proof + AABB model).
- Procedural unrigged character (no skinned mesh/mocap); music is a minimal loop.
- Shadow frustum covers the player neighbourhood by design (light budget).
- On CPU-only/software rendering (SwiftShader CI) real FPS is single-digits and the sim
  runs slower than wall-clock (dt clamp) — timing-sensitive tests therefore POLL game state
  instead of sleeping fixed durations. On real GPUs medium preset targets 60 FPS.
- Headless Chromium CDP touch injection is unreliable; E2E falls back to synthetic
  `TouchEvent`s through the real handlers (same code path a phone uses).
- No post-processing bloom (kept out deliberately; optional future work).

## 10. Gotchas learned the hard way (read before editing)

- **Never rebuild (`npm run build`) while an E2E run is in flight** — vite preview serves
  from disk per request; swapping hashed bundles mid-session breaks the page.
- `dt` clamp means "FPS" from sim time is wrong; `GameLoop` accumulates raw dt for FPS.
- `Object3D.clone()` shares GPU resources → recycling must detach, not dispose.
- Canvas textures: set `colorSpace = SRGBColorSpace` or colours wash out under ACES.
- Deck material colour MULTIPLIES the (dark) canvas map — brighten the map, not just colour.
- Saffron albedo under cyan light reads green — player rim light kept dim (intensity 7).
- Touchend may carry empty `changedTouches` (synthetic/cancelled streams) → InputManager
  falls back to last touchmove coordinates.
- Dispatched (untrusted) KeyboardEvents work for tests; real keys go through the same path.
- The sandbox/virtualised paths: avoid literal absolute workspace paths inside heredocs.

## 11. Git state & publishing

- Branch `feat/neon-metro-rush` (created from `main`), meaningful commits per layer
  (scaffold → core → world → gameplay → ui → tests → docs → polish/e2e).
- No remote configured in this environment. To publish:
  ```bash
  git remote add origin <your-fork-url>
  git push -u origin feat/neon-metro-rush
  # then open a PR feat/neon-metro-rush → main (summary in README/PROJECT_REPORT)
  ```
- CI: `.github/workflows/deploy.yml` runs lint+test+build and deploys `dist/` to GitHub Pages.
  Vercel/Netlify: build `npm run build`, publish `dist` (relative base makes subpaths work).

## 12. If you are asked to extend this project

- New obstacle kind: add dims in `utils/constants.ts` + mesh in `EnvironmentFactory.buildObstacle`
  + template entries in `PatternPlanner.STAGE_TEMPLATES` + fairness tests.
- New power-up: `POWERUPS` config + `PowerUpTimers` durations + `Game.activatePowerUp`
  effects + HUD `PU_META` entry + pickup mesh in factory.
- New chunk type: decor builder in `EnvironmentFactory` + add to `ChunkGenerator.ALL_TYPES`
  + variety-rule tests.
- Curved track: replace treadmill translation with spline-following chunk placement; collision
  must move to oriented boxes or local-space transforms (see PROJECT_REPORT §23).
