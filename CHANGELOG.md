# Changelog

All notable changes to **Neon Metro Rush** are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning follows [SemVer](https://semver.org/).

## [1.0.0] — 2025-10-02

### Added
- Complete playable 3D endless runner: three lanes, jump, slide, lean, 3-life system with invincibility frames.
- Procedural world: six chunk types (open track, tunnel, station, market, bridge, construction) recycled from a pooled ring.
- Seeded, fairness-validated procedural generation (obstacle rows, coin patterns, protected-lane rule, grace gaps).
- Four power-ups (Coin Magnet, Shield, x2 Score, Jet Boost) with HUD chips, countdown bars, 3D effects and expiry feedback.
- Original procedurally animated runner character with three colour variants.
- Difficulty stages, speed ramp, distance/coin scoring, clean-run multiplier to x5.
- localStorage persistence: high score, best distance, total coins, run count, settings.
- Full UI suite: loading with progress, menu, HUD, pause, game over, how-to-play, graphics-concepts explainer, settings, credits, toasts.
- Graphics quality presets (Low/Medium/High): pixel ratio, shadows, fog/draw distance, particle cap, decor density, chunk count.
- F3 debug overlay (FPS, speed, distance, lane, entities, particles, chunk, stage, seed, power-ups) + live collision-box helpers.
- Procedural Web Audio music + SFX; autoplay-policy-compliant unlock; volume/mute settings.
- Particle system on a custom GLSL point-sprite shader.
- Camera system: damped follow, look-ahead, speed FOV, roll lean, shake (toggleable), landing dip.
- Error handling: WebGL-absent message, storage fallbacks, fullscreen/audio guards, tab-hidden auto-pause, resize/orientation handling.
- 74 Vitest unit tests including 6 000+ row fairness fuzzing.
- Headless-Chromium E2E smoke validation of a full play session with zero console errors.
- Documentation: README, PROJECT_REPORT, VIVA_QUESTIONS (45), ASSET_CREDITS, LICENSE, .gitignore, GitHub Actions deploy workflow.

### Changed
- n/a (initial release)

### Fixed
- n/a (initial release)
