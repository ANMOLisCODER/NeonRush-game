# VIVA QUESTIONS & ANSWERS — NEON METRO RUSH

45 concise viva-voce questions with answers, mapped to where each topic lives in the codebase.

## Computer Graphics fundamentals

1. **What is the graphics pipeline in this project?**
   Vertex transform (model → world → view → clip) → rasterisation → fragment shading (PBR lighting, shadow lookup, fog) → tone mapping (ACES) → sRGB encode → framebuffer. Implemented via Three.js `WebGLRenderer`; see `World.render()`.

2. **Why perspective rather than orthographic projection?**
   Perspective foreshortening gives depth cues essential for judging speed and distance in a runner. Orthographic would flatten lanes and hide approach timing. (`World.camera` = `PerspectiveCamera`.)

3. **What parameters define the projection matrix here?**
   FOV (62° base, widening to 76° with speed), aspect (viewport), near 0.1, far = drawDistance + 120 per quality preset.

4. **How does the camera "look at" the player?**
   `CameraSystem` builds a damped target ahead of the player (look-ahead z = −9), calls `camera.lookAt`, then adds a small roll around the view axis for lane-change lean.

5. **What is a view (camera) transformation?**
   The inverse of the camera's world matrix; it expresses the scene in eye space. Three.js computes it from position/orientation each frame (`updateMatrixWorld`).

6. **Explain translation, rotation, scaling as matrices.**
   T moves, R orients, S stretches; composed as M = T·R·S. In the game: chunks translate on +Z each frame, coins rotate on their axis, unit-box meshes are scaled per prop (`mesh.scale.set(w,h,d)`).

7. **What is hierarchical (scene-graph) transformation?**
   Child matrices multiply into parents'. The runner's shin inherits the thigh's hip rotation — rotating `thighL` swings the whole leg. (`Player` rig groups.)

8. **Why is matrix composition order important?**
   Scaling after rotation scales along rotated axes; our unit-box props scale in local space first, then position — keeping boxes axis-aligned for cheap collisions.

9. **What is a normal and why does lighting need it?**
   The surface direction used in dot products with light vectors. Three.js supplies transformed normals (`normalMatrix`) to the PBR shader.

10. **Difference between Lambert, Phong and PBR materials?**
    Lambert: diffuse only; Phong: adds specular highlight; PBR (metalness–roughness, used via `MeshStandardMaterial`) models energy-conserving diffuse+specular with microfacet BRDFs. Neon signs use unlit `MeshBasicMaterial` instead.

11. **What lighting does the scene use and why that budget?**
    Hemisphere (ambient sky/ground), one directional moonlight (shadows), two point lights (neon rims). Four lights keep the fragment shader cheap on mobile GPUs.

12. **How do shadows work here?**
    The moon light renders depth into a shadow map (512/1024/2048 per preset); during shading, fragments project into light space and compare depth (PCF soft filtering, bias + normalBias to avoid acne/peter-panning).

13. **What is shadow acne and how did you avoid it?**
    Self-shadowing artifacts from depth precision; mitigated with `shadow.bias = -0.0006` and `normalBias = 0.02`.

14. **What is fog used for besides atmosphere?**
    Depth cueing *and* hiding the chunk recycle seam: fog far ≈ spawn distance so chunks fade in invisibly.

15. **Explain alpha blending vs additive blending in the game.**
    Shield bubble & holograms: normal alpha blend with `depthWrite:false`. Particles: additive (colours sum) for glow; ordering issues are avoided by not writing depth.

16. **What is tone mapping and which curve is used?**
    Mapping HDR-ish radiance to display range; ACES filmic (`renderer.toneMapping`) keeps neon emissives from clipping harshly.

17. **Why set output colour space to sRGB?**
    Displays expect sRGB-encoded values; lighting math happens in linear space, so the renderer encodes at the end (`outputColorSpace = SRGBColorSpace`), and `CanvasTexture`s are tagged sRGB on input.

18. **What are UVs and where do you use them?**
    2D texture coordinates. Deck texture repeats along the track (`RepeatWrapping`, repeat 2×8); signage planes map full 0..1; coin faces use cylinder cap UVs.

19. **How are textures created without image files?**
    `CanvasTexture`: draw into an offscreen 2D canvas (windows, signs, stripes, holo ads), upload as texture — demonstrating the full texture pipeline with zero binary assets.

20. **What is an emissive material and where is it used?**
    Material that adds self-illumination (`emissive` + intensity): neon trims, visor, sign glow, warning lamps — reads as light sources without extra real lights.

## Three.js specifics

21. **Why Three.js instead of raw WebGL?**
    Scene graph, materials, shadow maps, loaders and math are production-tested; raw WebGL would multiply effort without adding learning value beyond what the custom particle shader already demonstrates.

22. **What is the difference between `Mesh`, `Group`, `Scene`?**
    `Mesh` renders geometry+material; `Group` is a transform container (rig joints, chunk roots); `Scene` is the root graph plus fog/background.

23. **What is `InstancedMesh` and where is it used?**
    One draw call for many matrices of the same geometry: track sleepers, skyline buildings, bridge city lights. Set via `setMatrixAt`.

24. **How do you avoid GC churn mid-run?**
    Object pools (`ObjectPool`) for obstacles/coins/power-ups/particles; shared geometry/material cache; decor prototypes cloned (sharing GPU resources); reverse-iteration splice for despawn.

25. **When must you call `dispose()`?**
    On teardown of geometry/material/texture/render targets to free GPU memory: `utils/dispose.ts`, `EnvironmentFactory.dispose()`, `ParticleSystem.dispose()`, `World.dispose()`.

26. **What is frustum culling and do you use it?**
    Skipping objects outside the camera frustum; Three.js does it per-object by default. The particle cloud sets `frustumCulled=false` (its bounds span the play area) while chunks cull normally.

27. **How is level-of-detail expressed?**
    Quality presets scale pixel ratio, shadow map size, fog/draw distance, decoration density, particle cap and chunk ring size — a distance/quality-based visual budget rather than per-mesh LODs.

28. **What does `renderer.setPixelRatio` cap achieve?**
    Limits supersampling cost on HiDPI screens (cap 1/1.5/2 per preset) — the single biggest mobile perf lever.

29. **Why clone decoration prototypes instead of rebuilding?**
    `Object3D.clone()` shares geometry/material references; recycling a chunk re-parents a cheap clone — no GPU uploads mid-run.

30. **How are the custom particle shaders structured?**
    Vertex shader reads per-particle `psize/palpha/pcolor` attributes, scales `gl_PointSize` by `1/-mvPosition.z`; fragment samples a radial sprite, multiplies alpha, discards transparent texels; additive blending.

## Math & transformations

31. **Write the damping formula you use and why it is frame-rate independent.**
    `damp(a,b,λ,dt) = lerp(a,b,1−e^(−λ·dt))`; composing steps over equal total time multiplies the same exponential factor, so 30 Hz and 144 Hz converge identically.

32. **Why clamp delta time?**
    Tab switches/hitches produce huge Δt → tunnelling and physics explosions; clamped to 50 ms (`GameLoop.MAX_DELTA`).

33. **What integration scheme does the jump use?**
    Semi-implicit Euler: `v += g·dt; y += v·dt` — stable and cheap for ballistic arcs.

34. **How is jump height derived?**
    Apex = v²/(2|g|) = 9.2²/52 ≈ 1.63 m, chosen to clear 0.95 m barriers with margin; verified in `tests/lanes.test.ts`.

35. **What is a seeded PRNG and why seed runs?**
    Deterministic sequence from a seed (mulberry32). The run seed prints in the F3 overlay so any generated layout can be reproduced for debugging.

## Collision detection

36. **Why AABB over OBB/spheres here?**
    Lanes and gravity keep motion axis-aligned; AABB overlap is six comparisons — ideal for hundreds of checks per frame.

37. **What is broad phase vs narrow phase in your system?**
    Broad: reject entities whose Z window misses the player. Narrow: full 3-axis AABB overlap.

38. **How does pose affect collision?**
    Player box height switches 1.72 m ↔ 0.75 m while sliding; jump lifts the box's minY — this is what makes overhead signs and low barriers honest.

39. **How are collision boxes kept in sync with visuals?**
    Boxes derive from the same dimension constants used to build the meshes (`OBSTACLE_DIMS`), so tuning visuals and physics together is impossible to desync.

40. **What prevents tunnelling at max speed?**
    Max travel per clamped frame = 34 m/s × 0.05 s = 1.7 m; obstacle depth ≥ 0.6 m plus Z-margin 0.5 in broad phase keeps contacts detectable; trains are 14–20 m long.

## Procedural generation

41. **State the fairness invariant of row generation.**
    ≥1 lane free of impassable obstacles AND (a passable lane empty OR all passable-lane obstacles share one clearable action: all-jump or all-slide).

42. **How is the invariant enforced in code?**
    Templates build candidate rows; `planRow` rerolls lanes until a `protectedLane` (post-switch) is passable, with a hard fallback row; Vitest fuzzes 6 000+ rows per run.

43. **Why schedule rows in distance space, not world space?**
    Spacing stays exact at every speed: a row is placed when `distance + spawnAhead ≥ nextRowAt`, guaranteeing designed reaction gaps regardless of FPS or velocity.

44. **How do chunks recycle without visible pops?**
    Fixed ring scrolls; chunks past the camera teleport ahead of the front chunk; fog hides the seam; decor clones swap at the same instant.

## Optimisation & architecture

45. **Name five optimisations and their measured effect.**
    (1) Pooling → zero mid-run allocation/GC; (2) InstancedMesh → skyline in one draw call; (3) DPR cap → up to 4× fewer fragment shader invocations on HiDPI; (4) single shadow light with tight frustum → small shadow passes; (5) throttled HUD (12 Hz) → DOM work off the hot path. Architecture keeps pure logic testable and UI/simulation decoupled; settings broadcast live; storage parsing never throws.
