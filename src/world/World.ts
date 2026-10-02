import * as THREE from 'three';
import { CAMERA, QualityPreset } from '../config/gameConfig';

/**
 * Owns the renderer, scene graph root, sky, lights and fog — the "graphics
 * pipeline" host. Demonstrates: perspective projection, tone mapping, color
 * space management, shadow mapping, fog depth cueing and light budgeting.
 */
export class World {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;

  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private playerLight: THREE.PointLight;
  private accentLight: THREE.PointLight;
  private stars: THREE.Points;
  private preset: QualityPreset;

  constructor(canvas: HTMLCanvasElement, preset: QualityPreset) {
    this.preset = preset;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: preset.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap));
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.26;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    const nightColor = new THREE.Color(0x070816);
    this.scene.background = nightColor;
    this.scene.fog = new THREE.Fog(nightColor, 24, preset.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV_BASE,
      1,
      0.1,
      preset.drawDistance + 120,
    );
    this.camera.position.set(0, CAMERA.OFFSET_Y, CAMERA.OFFSET_Z);

    // ---------------------------------------------------------- lighting
    // Ambient sky/ground bounce (hemisphere light).
    this.hemiLight = new THREE.HemisphereLight(0x3a468a, 0x101222, 1.05);
    this.scene.add(this.hemiLight);

    // Directional "moonlight" — the only shadow caster (light budget).
    this.moonLight = new THREE.DirectionalLight(0xb8c6ff, 1.35);
    this.moonLight.position.set(-22, 34, 14);
    this.moonLight.target.position.set(0, 0, -14);
    this.moonLight.castShadow = preset.shadows;
    this.moonLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    const sc = this.moonLight.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 4;
    sc.far = 90;
    this.moonLight.shadow.bias = -0.0006;
    this.moonLight.shadow.normalBias = 0.02;
    this.scene.add(this.moonLight, this.moonLight.target);

    // Two carefully budgeted point lights: neon rim on the player + accent.
    this.playerLight = new THREE.PointLight(0x7fd4ff, 7, 13, 2);
    this.playerLight.position.set(0, 2.6, 1.5);
    this.scene.add(this.playerLight);

    this.accentLight = new THREE.PointLight(0xff4fd8, 8, 22, 2);
    this.accentLight.position.set(4, 3.4, -12);
    this.scene.add(this.accentLight);

    // ------------------------------------------------------------- sky
    this.stars = this.buildStars();
    this.scene.add(this.stars);
    this.scene.add(this.buildMoon());
    this.scene.add(this.buildFarGround());
  }

  private buildStars(): THREE.Points {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Upper hemisphere shell.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      const r = 380;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.8 + 30;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 120;
      const pick = Math.random();
      c.setHSL(pick < 0.2 ? 0.08 : pick < 0.5 ? 0.58 : 0.72, 0.6, 0.7 + Math.random() * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    return stars;
  }

  private buildMoon(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(11, 24, 18);
    const mat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false, toneMapped: false });
    const moon = new THREE.Mesh(geo, mat);
    moon.position.set(-260, 195, -430);
    // Halo.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(15, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0x8fa8ff,
        transparent: true,
        opacity: 0.16,
        fog: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    moon.add(halo);
    return moon;
  }

  private buildFarGround(): THREE.Mesh {
    // Dark city floor far below the elevated track (reads on bridge chunks).
    const geo = new THREE.PlaneGeometry(900, 900);
    const mat = new THREE.MeshBasicMaterial({ color: 0x05060e, fog: true });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -19;
    return ground;
  }

  /** Keep the player-attached light following the action. */
  updateFollowLight(x: number, y: number): void {
    this.playerLight.position.set(x, y + 2.4, 1.2);
    this.accentLight.position.set(x * 0.4 + 4, 3.4, -14);
  }

  /** Live-apply a quality preset (renderer + fog + shadows). */
  applyQuality(preset: QualityPreset, pixelRatio: number): void {
    this.preset = preset;
    this.renderer.setPixelRatio(pixelRatio);
    const fog = this.scene.fog as THREE.Fog;
    fog.far = preset.fogFar;
    this.camera.far = preset.drawDistance + 120;
    this.camera.updateProjectionMatrix();

    const wantShadows = preset.shadows;
    if (wantShadows !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = wantShadows;
      this.moonLight.castShadow = wantShadows;
      this.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => (m.needsUpdate = true));
        }
      });
    }
    if (
      wantShadows &&
      this.moonLight.shadow.mapSize.x !== preset.shadowMapSize
    ) {
      this.moonLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.moonLight.shadow.map?.dispose();
      this.moonLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  getPreset(): QualityPreset {
    return this.preset;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      mats.forEach((m) => m.dispose());
    });
    this.renderer.dispose();
  }
}
