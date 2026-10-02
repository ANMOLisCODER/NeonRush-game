# ASSET CREDITS

Neon Metro Rush ships **no third-party creative assets**. Every visual and
audio asset is generated procedurally by original code at runtime.

## Procedural assets (original, © project author, MIT-licensed with the code)

| Asset | Creator | Source | License | Used in |
|-------|---------|--------|---------|---------|
| Building window textures | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Skyline InstancedMesh, station backdrops |
| Neon shop signs (fictional names: "CHAI POINT 2077", "MASALA BYTE", …) | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Market stalls, tunnel walls, billboards |
| Holographic ad panels (fictional copy) | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Station platforms |
| Metro train livery texture | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Train obstacles |
| Track/deck surface texture | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Track chunks |
| Hazard stripe texture | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Barriers, construction props |
| Tunnel tile texture | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Tunnel chunks |
| Coin face texture (original hexagon "N" token) | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | Coins |
| Particle sprite (radial gradient) | Original code (canvas) | `src/world/Textures.ts` | MIT (project) | ParticleSystem |
| All 3D geometry (character rig, track, props, obstacles) | Original code (Three.js primitives) | `src/world/EnvironmentFactory.ts`, `src/entities/Player.ts` | MIT (project) | Entire scene |
| Music & all sound effects (synthesis recipes) | Original code (Web Audio API) | `src/core/AudioManager.ts` | MIT (project) | Audio |
| Favicon / app icon (inline SVG data URI) | Original artwork | `index.html` | MIT (project) | Browser tab |
| UI typography | System font stack (Trebuchet MS / Segoe UI / Noto Sans fallbacks) | OS-provided | System fonts, no redistribution | UI |

## Third-party libraries (code dependencies, not assets)

| Library | License | Source URL | Used for |
|---------|---------|-----------|----------|
| three | MIT | https://github.com/mrdoob/three.js | WebGL rendering |
| typescript | Apache-2.0 | https://github.com/microsoft/TypeScript | Language/tooling |
| vite | MIT | https://github.com/vitejs/vite | Dev server & bundler |
| vitest | MIT | https://github.com/vitest-dev/vitest | Unit tests |
| eslint + typescript-eslint | MIT | https://github.com/eslint/eslint | Linting |

## Explicit exclusions

- No Subway Surfers (or any other game) characters, maps, branding, logos,
  textures, sounds, animations, UI layouts, names or code are used or
  reproduced. The genre conventions (three lanes, swipe controls) are
  unprotectable gameplay ideas; all expression here is original.
- No real-world brand names or logos appear on signage; all shop names,
  station names and ad copy are fictional originals.
- No fonts, images, models or audio were downloaded from the internet.

If any asset is later added from an external source, it must be listed here
with name, creator, source URL, license and usage location — and must not be
included if its license cannot be verified.
