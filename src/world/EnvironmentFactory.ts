import * as THREE from 'three';
import {
  HOLO_AD_TEXTS,
  NEON_SIGN_TEXTS,
  QualityPreset,
  WORLD,
} from '../config/gameConfig';
import { ChunkType, OBSTACLE_DIMS, ObstacleKind, PowerUpKind } from '../utils/constants';
import { mulberry32, randRange } from '../utils/math';
import {
  makeCoinTexture,
  makeHoloTexture,
  makeSignTexture,
  makeStripeTexture,
  makeTrackTexture,
  makeTrainTexture,
  makeTunnelTexture,
  makeWindowTexture,
} from './Textures';

/**
 * Builds every 3D asset procedurally and caches geometries / materials /
 * textures so chunks and pooled entities share GPU resources (a core
 * performance requirement). Chunk decorations are built once per type as
 * "prototypes" and cheaply Object3D.clone()-d on recycle (clone shares
 * geometry + material references).
 */

const HALF_CHUNK = WORLD.CHUNK_LENGTH / 2;
const TRACK_W = WORLD.TRACK_WIDTH;

const SIGN_COLORS: Array<[string, string]> = [
  ['#ff4fd8', '#39d0ff'],
  ['#39d0ff', '#ff9a3c'],
  ['#7dff6a', '#ff4fd8'],
  ['#ffc23c', '#39d0ff'],
  ['#ff6a5a', '#7dff6a'],
  ['#9d7bff', '#ffc23c'],
];

export class EnvironmentFactory {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.Material>();
  private textures = new Map<string, THREE.Texture>();
  private decorPrototypes = new Map<string, THREE.Group>();
  private pulseMaterials: THREE.MeshStandardMaterial[] = [];
  private holoMaterials: THREE.MeshBasicMaterial[] = [];
  private preset: QualityPreset;

  constructor(preset: QualityPreset) {
    this.preset = preset;
  }

  setPreset(preset: QualityPreset): void {
    if (preset.decorDensity !== this.preset.decorDensity) {
      // Density baked into prototypes -> rebuild them lazily.
      this.decorPrototypes.clear();
    }
    this.preset = preset;
  }

  // ------------------------------------------------------------ resources

  private unitBox(): THREE.BoxGeometry {
    return this.cachedGeometry('box', () => new THREE.BoxGeometry(1, 1, 1));
  }

  private cone(): THREE.ConeGeometry {
    return this.cachedGeometry('cone', () => new THREE.ConeGeometry(0.5, 1, 10));
  }

  private plane(): THREE.PlaneGeometry {
    return this.cachedGeometry('plane', () => new THREE.PlaneGeometry(1, 1));
  }

  private sphere(): THREE.SphereGeometry {
    return this.cachedGeometry('sphere', () => new THREE.SphereGeometry(0.5, 12, 10));
  }

  private torus(): THREE.TorusGeometry {
    return this.cachedGeometry('torus', () => new THREE.TorusGeometry(0.5, 0.06, 8, 24));
  }

  private octahedron(): THREE.OctahedronGeometry {
    return this.cachedGeometry('octa', () => new THREE.OctahedronGeometry(0.5, 0));
  }

  private cachedGeometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geometries.get(key);
    if (!g) {
      g = make();
      this.geometries.set(key, g);
    }
    return g as T;
  }

  private mat(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.materials.get(key);
    if (!m) {
      m = make();
      this.materials.set(key, m);
    }
    return m;
  }

  private tex(key: string, make: () => THREE.Texture): THREE.Texture {
    let t = this.textures.get(key);
    if (!t) {
      t = make();
      this.textures.set(key, t);
    }
    return t;
  }

  std(color: number, rough = 0.7, metal = 0.1, emissive = 0x000000, emissiveIntensity = 1): THREE.MeshStandardMaterial {
    const key = `std-${color}-${rough}-${metal}-${emissive}-${emissiveIntensity}`;
    return this.mat(
      key,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: rough,
          metalness: metal,
          emissive,
          emissiveIntensity,
        }),
    ) as THREE.MeshStandardMaterial;
  }

  basic(color: number): THREE.MeshBasicMaterial {
    return this.mat(`basic-${color}`, () => new THREE.MeshBasicMaterial({ color })) as THREE.MeshBasicMaterial;
  }

  /** Quick box mesh from the shared unit geometry. */
  private box(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.unitBox(), material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // ------------------------------------------------------------ track base

  /** Static track structure shared by every chunk (platform, rails, walls). */
  buildTrackBase(): THREE.Group {
    const group = new THREE.Group();
    const L = WORLD.CHUNK_LENGTH;

    const deckMat = this.mat('deck', () => {
      const m = new THREE.MeshStandardMaterial({
        color: 0xaab0d0, // texture carries the tone; colour lifts night exposure
        roughness: 0.85,
        metalness: 0.25,
        map: this.tex('track', () => makeTrackTexture()),
      });
      return m;
    });
    const deck = this.box(TRACK_W, 0.5, L, deckMat, 0, -0.25, 0);
    deck.receiveShadow = true;
    group.add(deck);

    // Side walls with neon trim.
    const wallMat = this.std(0x14162a, 0.8, 0.2);
    const trimMat = this.std(0x39d0ff, 0.4, 0.2, 0x39d0ff, 1.6);
    for (const side of [-1, 1]) {
      const x = side * (TRACK_W / 2 + 0.15);
      group.add(this.box(0.3, 0.9, L, wallMat, x, 0.45, 0));
      group.add(this.box(0.34, 0.06, L, trimMat, x, 0.92, 0));
    }

    // Rails: two glowing strips per lane boundary + lane centre guides.
    const railMat = this.std(0x8f9bbd, 0.35, 0.85);
    const guideMat = this.std(0xff4fd8, 0.4, 0.2, 0xff4fd8, 1.1);
    for (const lane of [-1, 0, 1]) {
      const cx = lane * 2.4;
      group.add(this.box(0.12, 0.12, L, railMat, cx - 0.75, 0.06, 0));
      group.add(this.box(0.12, 0.12, L, railMat, cx + 0.75, 0.06, 0));
    }
    for (const gx of [-1.2, 1.2]) {
      group.add(this.box(0.05, 0.02, L, guideMat, gx, 0.015, 0));
    }

    // Sleepers via InstancedMesh (demonstrates instancing).
    const sleeperCount = Math.floor(L / 1.6);
    const sleepers = new THREE.InstancedMesh(
      this.unitBox(),
      this.std(0x2c2f45, 0.9, 0.1),
      sleeperCount,
    );
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < sleeperCount; i++) {
      mtx.makeScale(TRACK_W - 0.6, 0.08, 0.5);
      mtx.setPosition(0, 0.01, -HALF_CHUNK + 0.8 + i * 1.6);
      sleepers.setMatrixAt(i, mtx);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    group.add(sleepers);

    // Underside structure so bridges/elevated sections read from below.
    const underMat = this.std(0x0c0e1c, 0.95, 0.1);
    group.add(this.box(TRACK_W + 0.6, 0.4, L, underMat, 0, -0.7, 0));
    for (let i = 0; i < 4; i++) {
      group.add(this.box(0.5, 1.6, 0.5, underMat, -TRACK_W / 2 + 1 + i * ((TRACK_W - 2) / 3), -1.6, -HALF_CHUNK + 4 + i * 9));
    }
    return group;
  }

  // ------------------------------------------------------------ decorations

  /** Get (and lazily build) a decoration prototype for a chunk type+variant. */
  getDecorPrototype(type: ChunkType, variant: number): THREE.Group {
    const key = `${type}-${variant}`;
    let proto = this.decorPrototypes.get(key);
    if (!proto) {
      proto = this.buildDecor(type, variant);
      this.decorPrototypes.set(key, proto);
    }
    return proto;
  }

  private buildDecor(type: ChunkType, variant: number): THREE.Group {
    const rng = mulberry32(variant * 7919 + type.length * 104729 + 17);
    const density = this.preset.decorDensity;
    const group = new THREE.Group();
    group.name = `decor-${type}-${variant}`;
    switch (type) {
      case 'open':
        this.decorOpen(group, rng, density);
        break;
      case 'tunnel':
        this.decorTunnel(group, rng, density);
        break;
      case 'station':
        this.decorStation(group, rng, density);
        break;
      case 'market':
        this.decorMarket(group, rng, density);
        break;
      case 'bridge':
        this.decorBridge(group, rng, density);
        break;
      case 'construction':
        this.decorConstruction(group, rng, density);
        break;
    }
    group.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    return group;
  }

  private addBuildings(group: THREE.Group, rng: () => number, density: number): void {
    const count = Math.max(4, Math.floor(14 * density));
    const windowTex = this.tex('windows', () => makeWindowTexture(11));
    const buildingMat = this.mat('building', () =>
      new THREE.MeshStandardMaterial({
        color: 0x1a1e33,
        roughness: 0.9,
        metalness: 0.15,
        map: windowTex,
        emissive: 0xffffff,
        emissiveMap: windowTex,
        emissiveIntensity: 0.55,
      }),
    );
    const inst = new THREE.InstancedMesh(this.unitBox(), buildingMat, count * 2);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let b = 0; b < count; b++) {
      for (const side of [-1, 1]) {
        const w = randRange(rng, 5, 11);
        const h = randRange(rng, 9, 42);
        const d = randRange(rng, 5, 11);
        const x = side * randRange(rng, 13, 34);
        const z = randRange(rng, -HALF_CHUNK, HALF_CHUNK);
        m.makeScale(w, h, d);
        m.setPosition(x, h / 2 - 2, z);
        inst.setMatrixAt(i++, m);
      }
    }
    inst.count = i;
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  private streetLight(x: number, z: number, color = 0xffc98a): THREE.Group {
    const g = new THREE.Group();
    const poleMat = this.std(0x30344c, 0.6, 0.5);
    g.add(this.box(0.14, 4.2, 0.14, poleMat, 0, 2.1, 0));
    g.add(this.box(0.9, 0.1, 0.1, poleMat, x > 0 ? -0.4 : 0.4, 4.1, 0));
    const bulb = this.box(0.5, 0.12, 0.24, this.basic(color), x > 0 ? -0.8 : 0.8, 4.02, 0);
    g.add(bulb);
    g.position.set(x, 0, z);
    return g;
  }

  private signalGantry(z: number, rng: () => number): THREE.Group {
    const g = new THREE.Group();
    const metal = this.std(0x3a3f5c, 0.5, 0.6);
    const halfW = TRACK_W / 2 + 0.4;
    g.add(this.box(0.18, 4.6, 0.18, metal, -halfW, 2.3, z));
    g.add(this.box(0.18, 4.6, 0.18, metal, halfW, 2.3, z));
    g.add(this.box(halfW * 2, 0.16, 0.16, metal, 0, 4.5, z));
    const colors = [0x37d67a, 0xffc23c, 0xff4d4d];
    for (const lane of [-1, 0, 1]) {
      const c = colors[Math.floor(rng() * colors.length) % colors.length];
      const lamp = new THREE.Mesh(this.sphere(), this.mat(`lamp-${c}`, () =>
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, roughness: 0.3 }),
      ));
      lamp.scale.setScalar(0.28);
      lamp.position.set(lane * 2.4, 4.3, z);
      g.add(lamp);
    }
    return g;
  }

  private decorOpen(group: THREE.Group, rng: () => number, density: number): void {
    this.addBuildings(group, rng, density);
    const lights = Math.max(2, Math.floor(4 * density));
    for (let i = 0; i < lights; i++) {
      const z = -HALF_CHUNK + 4 + i * (WORLD.CHUNK_LENGTH / lights);
      group.add(this.streetLight(-(TRACK_W / 2 + 1.1), z));
      group.add(this.streetLight(TRACK_W / 2 + 1.1, z + WORLD.CHUNK_LENGTH / lights / 2));
    }
    if (density > 0.5) group.add(this.signalGantry(randRange(rng, -6, 6), rng));
    // Neon billboards on distant buildings.
    const signs = Math.max(1, Math.floor(3 * density));
    for (let i = 0; i < signs; i++) {
      const text = NEON_SIGN_TEXTS[Math.floor(rng() * NEON_SIGN_TEXTS.length) % NEON_SIGN_TEXTS.length];
      const [main, accent] = SIGN_COLORS[Math.floor(rng() * SIGN_COLORS.length) % SIGN_COLORS.length];
      const signMat = this.mat(`sign-${text}-${main}`, () => {
        const map = makeSignTexture(text, main, accent);
        return new THREE.MeshBasicMaterial({ map, toneMapped: false });
      });
      const side = rng() < 0.5 ? -1 : 1;
      const sign = new THREE.Mesh(this.plane(), signMat);
      sign.scale.set(6.4, 1.6, 1);
      sign.position.set(side * randRange(rng, 11, 15), randRange(rng, 5, 12), randRange(rng, -12, 12));
      sign.rotation.y = side * -Math.PI / 2 + (rng() - 0.5) * 0.3;
      group.add(sign);
    }
  }

  private decorTunnel(group: THREE.Group, rng: () => number, density: number): void {
    const wallTex = this.tex('tunnel', () => makeTunnelTexture());
    const wallMat = this.mat('tunnelwall', () =>
      new THREE.MeshStandardMaterial({ color: 0x181b2e, map: wallTex, roughness: 0.9, metalness: 0.1 }),
    );
    const halfW = TRACK_W / 2 + 0.9;
    for (const side of [-1, 1]) {
      const wall = this.box(0.5, 4.6, WORLD.CHUNK_LENGTH, wallMat, side * halfW, 2.3, 0);
      group.add(wall);
    }
    const ceiling = this.box(halfW * 2 + 0.5, 0.4, WORLD.CHUNK_LENGTH, wallMat, 0, 4.9, 0);
    group.add(ceiling);

    const archCount = Math.max(3, Math.floor(8 * density));
    const archMat = this.std(0x252a44, 0.7, 0.35);
    const stripMat = this.std(0x9fd8ff, 0.4, 0.1, 0x9fd8ff, 1.4);
    for (let i = 0; i < archCount; i++) {
      const z = -HALF_CHUNK + 2 + i * (WORLD.CHUNK_LENGTH / archCount);
      group.add(this.box(0.3, 4.6, 0.5, archMat, -halfW + 0.35, 2.3, z));
      group.add(this.box(0.3, 4.6, 0.5, archMat, halfW - 0.35, 2.3, z));
      group.add(this.box(halfW * 2 - 0.4, 0.3, 0.5, archMat, 0, 4.6, z));
      group.add(this.box(halfW * 2 - 1.2, 0.06, 0.12, stripMat, 0, 4.42, z));
    }
    // Occasional wall graffiti panel (original abstract shapes).
    if (rng() < density) {
      const [main, accent] = SIGN_COLORS[Math.floor(rng() * SIGN_COLORS.length) % SIGN_COLORS.length];
      const text = NEON_SIGN_TEXTS[Math.floor(rng() * NEON_SIGN_TEXTS.length) % NEON_SIGN_TEXTS.length];
      const signMat = this.mat(`tsign-${text}-${main}`, () =>
        new THREE.MeshBasicMaterial({ map: makeSignTexture(text, main, accent), toneMapped: false }),
      );
      const sign = new THREE.Mesh(this.plane(), signMat);
      sign.scale.set(5.6, 1.4, 1);
      const side = rng() < 0.5 ? -1 : 1;
      sign.position.set(side * (halfW - 0.5), 2.4, randRange(rng, -8, 8));
      sign.rotation.y = side * -Math.PI / 2;
      group.add(sign);
    }
  }

  private decorStation(group: THREE.Group, rng: () => number, density: number): void {
    this.addBuildings(group, rng, density * 0.7);
    const platMat = this.std(0x20243c, 0.85, 0.15);
    const edgeMat = this.std(0xffc23c, 0.5, 0.2, 0xffc23c, 0.9);
    const pillarMat = this.std(0x2b3050, 0.6, 0.4);
    const roofMat = this.std(0x161a30, 0.8, 0.3);

    for (const side of [-1, 1]) {
      const px = side * (TRACK_W / 2 + 2.4);
      group.add(this.box(3.4, 0.7, WORLD.CHUNK_LENGTH - 2, platMat, px, 0.35, 0));
      group.add(this.box(0.16, 0.1, WORLD.CHUNK_LENGTH - 2, edgeMat, px - side * 1.62, 0.72, 0));
      const pillars = Math.max(2, Math.floor(4 * density));
      for (let i = 0; i < pillars; i++) {
        const z = -HALF_CHUNK + 3 + i * (WORLD.CHUNK_LENGTH / pillars);
        group.add(this.box(0.34, 3.4, 0.34, pillarMat, px, 2.4, z));
      }
      group.add(this.box(4.2, 0.24, WORLD.CHUNK_LENGTH - 1, roofMat, px, 4.2, 0));
      // Benches + waiting holo-ad.
      if (density > 0.5) {
        group.add(this.box(1.6, 0.14, 0.5, this.std(0x3a4166, 0.6, 0.3), px, 1.05, randRange(rng, -8, 8)));
        const ad = HOLO_AD_TEXTS[Math.floor(rng() * HOLO_AD_TEXTS.length) % HOLO_AD_TEXTS.length];
        const holoMat = this.mat(`holo-${ad}`, () => {
          const m = new THREE.MeshBasicMaterial({
            map: makeHoloTexture(ad, '#5ef2ff'),
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false,
          });
          this.holoMaterials.push(m);
          return m;
        });
        const holo = new THREE.Mesh(this.plane(), holoMat);
        holo.scale.set(2.2, 2.2, 1);
        holo.position.set(px - side * 0.9, 2.2, randRange(rng, -6, 6));
        holo.rotation.y = side * -Math.PI / 2;
        group.add(holo);
      }
    }
    // Station name board across the track.
    const names = ['CHOWK STATION', 'JHILMIL JUNCTION', 'VYOM TERMINAL', 'SAAWN HALT'];
    const name = names[Math.floor(rng() * names.length) % names.length];
    const boardMat = this.mat(`board-${name}`, () =>
      new THREE.MeshBasicMaterial({
        map: makeSignTexture(name, '#7dff6a', '#39d0ff'),
        toneMapped: false,
      }),
    );
    const board = new THREE.Mesh(this.plane(), boardMat);
    board.scale.set(7.5, 1.5, 1);
    board.position.set(0, 4.0, randRange(rng, -10, 10));
    group.add(board);
    const boardBack = board.clone();
    boardBack.rotation.y = Math.PI;
    group.add(boardBack);
  }

  private decorMarket(group: THREE.Group, rng: () => number, density: number): void {
    this.addBuildings(group, rng, density * 0.6);
    const stallCount = Math.max(2, Math.floor(5 * density));
    const awningColors = [0xff9a3c, 0x37d67a, 0xff4fd8, 0x39d0ff, 0xffc23c, 0x9d7bff];
    const counterMat = this.std(0x3b2f23, 0.85, 0.1);
    for (let i = 0; i < stallCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -HALF_CHUNK + 3 + i * (WORLD.CHUNK_LENGTH / stallCount);
      const x = side * (TRACK_W / 2 + 1.7);
      const stall = new THREE.Group();
      stall.add(this.box(2.2, 1.0, 1.6, counterMat, 0, 0.5, 0));
      const ac = awningColors[Math.floor(rng() * awningColors.length) % awningColors.length];
      const awning = this.box(2.6, 0.1, 1.9, this.std(ac, 0.7, 0.1, ac, 0.25), 0, 2.1, 0);
      awning.rotation.z = side * 0.18;
      stall.add(awning);
      stall.add(this.box(0.1, 2.1, 0.1, this.std(0x555b78, 0.6, 0.4), -1.0, 1.05, -0.7));
      stall.add(this.box(0.1, 2.1, 0.1, this.std(0x555b78, 0.6, 0.4), 1.0, 1.05, -0.7));
      // Stall sign.
      const text = NEON_SIGN_TEXTS[Math.floor(rng() * NEON_SIGN_TEXTS.length) % NEON_SIGN_TEXTS.length];
      const [main, accent] = SIGN_COLORS[Math.floor(rng() * SIGN_COLORS.length) % SIGN_COLORS.length];
      const signMat = this.mat(`msign-${text}-${accent}`, () =>
        new THREE.MeshBasicMaterial({ map: makeSignTexture(text, main, accent), toneMapped: false }),
      );
      const sign = new THREE.Mesh(this.plane(), signMat);
      sign.scale.set(2.2, 0.55, 1);
      sign.position.set(0, 2.45, 0);
      sign.rotation.y = side * -Math.PI / 2;
      stall.add(sign);
      stall.position.set(x, 0, z);
      group.add(stall);
    }
    // String lights across the track.
    const bulbColors = [0xffc23c, 0xff4fd8, 0x7dff6a, 0x39d0ff];
    const strings = Math.max(2, Math.floor(4 * density));
    for (let s = 0; s < strings; s++) {
      const z = -HALF_CHUNK + 4 + s * (WORLD.CHUNK_LENGTH / strings);
      const bulbs = 9;
      for (let b = 0; b < bulbs; b++) {
        const t = b / (bulbs - 1);
        const x = (t - 0.5) * (TRACK_W + 2.4);
        const sag = -Math.sin(t * Math.PI) * 0.8;
        const c = bulbColors[(b + s) % bulbColors.length];
        const bulb = new THREE.Mesh(this.sphere(), this.basic(c));
        bulb.scale.setScalar(0.16);
        bulb.position.set(x, 4.4 + sag, z);
        group.add(bulb);
      }
    }
  }

  private decorBridge(group: THREE.Group, rng: () => number, density: number): void {
    // Open sky: railings + suspension pylons + cables.
    const metal = this.std(0x333a58, 0.5, 0.6);
    const glow = this.std(0x39d0ff, 0.4, 0.2, 0x39d0ff, 1.3);
    for (const side of [-1, 1]) {
      const x = side * (TRACK_W / 2 + 0.2);
      group.add(this.box(0.1, 1.1, WORLD.CHUNK_LENGTH, metal, x, 0.55, 0));
      group.add(this.box(0.14, 0.08, WORLD.CHUNK_LENGTH, glow, x, 1.12, 0));
      const posts = Math.max(3, Math.floor(6 * density));
      for (let i = 0; i < posts; i++) {
        const z = -HALF_CHUNK + i * (WORLD.CHUNK_LENGTH / posts);
        group.add(this.box(0.12, 1.1, 0.12, metal, x, 0.55, z));
      }
    }
    // Pylon + fan cables at chunk centre.
    const pylonH = 14;
    for (const side of [-1, 1]) {
      const px = side * (TRACK_W / 2 + 0.6);
      group.add(this.box(0.7, pylonH, 0.7, metal, px, pylonH / 2, 0));
      group.add(this.box(1.1, 0.3, 1.1, glow, px, pylonH, 0));
      for (let c = 1; c <= 4; c++) {
        const cable = this.box(0.05, 0.05, Math.hypot(c * 3.4, pylonH - 1.5), metal, px, (pylonH - 1.5) / 2 + 0.8, c * 1.7);
        cable.rotation.x = Math.atan2(pylonH - 1.5, c * 3.4) - Math.PI / 2;
        group.add(cable);
        const cable2 = cable.clone();
        cable2.position.z = -c * 1.7;
        cable2.rotation.x = -cable.rotation.x;
        group.add(cable2);
      }
    }
    // Distant city glow below the bridge.
    if (density > 0.4) {
      const windowTex = this.tex('windows2', () => makeWindowTexture(29));
      const farMat = this.mat('farbuilding', () =>
        new THREE.MeshBasicMaterial({ map: windowTex, color: 0x30364f, toneMapped: false }),
      );
      const inst = new THREE.InstancedMesh(this.unitBox(), farMat, 16);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 16; i++) {
        const w = randRange(rng, 4, 9);
        const h = randRange(rng, 10, 34);
        const side = i % 2 === 0 ? -1 : 1;
        m.makeScale(w, h, w);
        m.setPosition(side * randRange(rng, 16, 40), -18 + h / 2, randRange(rng, -HALF_CHUNK, HALF_CHUNK));
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    }
  }

  private decorConstruction(group: THREE.Group, rng: () => number, density: number): void {
    this.addBuildings(group, rng, density * 0.5);
    const steelMat = this.std(0xffa62b, 0.6, 0.4);
    const darkSteel = this.std(0x30344c, 0.55, 0.5);
    const stripeMat = this.mat('stripe', () =>
      new THREE.MeshStandardMaterial({
        map: this.tex('stripes', () => makeStripeTexture('#ffb02e', '#151824')),
        roughness: 0.7,
      }),
    );
    const warnMat = this.mat('warn-pulse', () => {
      const m = new THREE.MeshStandardMaterial({
        color: 0xff5a2b,
        emissive: 0xff5a2b,
        emissiveIntensity: 2,
        roughness: 0.4,
      });
      this.pulseMaterials.push(m);
      return m;
    });

    // Scaffolding towers on both sides.
    const towers = Math.max(1, Math.floor(3 * density));
    for (let t = 0; t < towers; t++) {
      const side = t % 2 === 0 ? -1 : 1;
      const z = -HALF_CHUNK + 5 + t * (WORLD.CHUNK_LENGTH / towers);
      const x = side * (TRACK_W / 2 + 1.6);
      const tower = new THREE.Group();
      const h = randRange(rng, 4.5, 7);
      for (const dx of [-0.9, 0.9]) {
        for (const dz of [-0.9, 0.9]) {
          tower.add(this.box(0.12, h, 0.12, steelMat, dx, h / 2, dz));
        }
      }
      for (let y = 1.2; y < h; y += 1.6) {
        tower.add(this.box(1.9, 0.1, 1.9, darkSteel, 0, y, 0));
      }
      tower.add(this.box(0.3, 0.3, 0.3, warnMat, 0, h + 0.2, 0));
      tower.position.set(x, 0, z);
      group.add(tower);
    }

    // Concrete stacks + cones near the walls (decor only, never in lanes).
    const props = Math.max(2, Math.floor(6 * density));
    for (let i = 0; i < props; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * (TRACK_W / 2 + 0.9 + rng() * 0.8);
      const z = randRange(rng, -HALF_CHUNK + 2, HALF_CHUNK - 2);
      if (rng() < 0.5) {
        const cone = new THREE.Mesh(this.cone(), stripeMat);
        cone.scale.set(0.55, 0.85, 0.55);
        cone.position.set(x, 0.42, z);
        group.add(cone);
      } else {
        group.add(this.box(1.2, 0.9, 0.9, this.std(0x59607d, 0.9, 0.1), x, 0.45, z));
      }
    }

    // Crane silhouette.
    if (density > 0.5) {
      const crane = new THREE.Group();
      const mastH = 16;
      crane.add(this.box(0.5, mastH, 0.5, darkSteel, 0, mastH / 2, 0));
      crane.add(this.box(12, 0.35, 0.35, steelMat, 4, mastH, 0));
      crane.add(this.box(0.12, 3.2, 0.12, darkSteel, 8.5, mastH - 1.7, 0));
      crane.add(this.box(0.8, 0.8, 0.8, stripeMat, 8.5, mastH - 3.6, 0));
      crane.add(this.box(0.25, 0.25, 0.25, warnMat, 0, mastH + 0.3, 0));
      crane.position.set(-(TRACK_W / 2 + 8), 0, randRange(rng, -8, 8));
      group.add(crane);
    }
  }

  // ------------------------------------------------------------- entities

  buildObstacle(kind: ObstacleKind, variant: number): THREE.Group {
    const group = new THREE.Group();
    const dims = OBSTACLE_DIMS[kind];
    switch (kind) {
      case 'low': {
        // Hover-barrier: striped hazard panel floating on emitters.
        const stripe = this.mat('barrier-stripe', () =>
          new THREE.MeshStandardMaterial({
            map: this.tex('stripes', () => makeStripeTexture('#ffb02e', '#151824')),
            roughness: 0.6,
            metalness: 0.2,
          }),
        );
        const frame = this.std(variant % 2 === 0 ? 0x30344c : 0x3c2f55, 0.55, 0.45);
        const body = this.box(dims.w, dims.h - 0.18, dims.d, stripe, 0, dims.h / 2 + 0.09, 0);
        body.castShadow = this.preset.shadows;
        group.add(body);
        group.add(this.box(dims.w + 0.14, 0.14, dims.d + 0.08, frame, 0, dims.h + 0.02, 0));
        group.add(this.box(dims.w + 0.14, 0.1, dims.d + 0.08, frame, 0, 0.2, 0));
        const glow = this.basic(variant % 2 === 0 ? 0x39d0ff : 0xff4fd8);
        group.add(this.box(0.3, 0.08, 0.3, glow, -dims.w / 2 + 0.3, 0.08, 0));
        group.add(this.box(0.3, 0.08, 0.3, glow, dims.w / 2 - 0.3, 0.08, 0));
        break;
      }
      case 'overhead': {
        // Hanging maintenance sign / conduit — slide under.
        const frame = this.std(0x2b3050, 0.5, 0.5);
        const panelMat = this.mat(`oh-sign-${variant}`, () => {
          const texts = ['KEEP CLEAR', 'DUCK!', 'निचका HOLO-GATE', 'MAINT. BAY'];
          const text = texts[variant % texts.length];
          const [main, accent] = SIGN_COLORS[variant % SIGN_COLORS.length];
          return new THREE.MeshBasicMaterial({
            map: makeSignTexture(text, main, accent),
            toneMapped: false,
          });
        });
        const panel = new THREE.Mesh(this.plane(), panelMat);
        panel.scale.set(dims.w, dims.h, 1);
        panel.position.set(0, dims.y + dims.h / 2, dims.d / 2 + 0.01);
        group.add(panel);
        const panelBack = new THREE.Mesh(this.plane(), this.std(0x1a1e33, 0.8, 0.3));
        panelBack.scale.set(dims.w, dims.h, 1);
        panelBack.position.set(0, dims.y + dims.h / 2, -dims.d / 2 - 0.01);
        panelBack.rotation.y = Math.PI;
        group.add(panelBack);
        group.add(this.box(dims.w + 0.2, 0.12, dims.d, frame, 0, dims.y + dims.h + 0.06, 0));
        group.add(this.box(dims.w + 0.2, 0.12, dims.d, frame, 0, dims.y - 0.06, 0));
        // Hover-drone pod carrying the sign (reads as intentional tech).
        const pod = this.box(0.62, 0.26, 0.44, frame, 0, dims.y + dims.h + 0.28, 0);
        group.add(pod);
        const rotorMat = this.basic(0x9fd8ff);
        for (const dx of [-0.42, 0.42]) {
          const rotor = this.box(0.44, 0.03, 0.1, rotorMat, dx, dims.y + dims.h + 0.46, 0);
          group.add(rotor);
        }
        const blink = this.std(0xff5a2b, 0.4, 0.2, 0xff5a2b, 2);
        group.add(this.box(0.09, 0.09, 0.09, blink, 0, dims.y + dims.h + 0.46, 0.2));
        break;
      }
      case 'tall': {
        // Signal / tech pylon block — must switch lanes.
        const body = this.std(variant % 2 === 0 ? 0x262b47 : 0x33264a, 0.6, 0.4);
        const main = this.box(dims.w, dims.h, dims.d, body, 0, dims.h / 2, 0);
        main.castShadow = this.preset.shadows;
        group.add(main);
        const stripColor = variant % 2 === 0 ? 0xff4d4d : 0xffc23c;
        const strip = this.std(stripColor, 0.4, 0.2, stripColor, 1.6);
        group.add(this.box(dims.w + 0.06, 0.18, dims.d + 0.06, strip, 0, dims.h - 0.5, 0));
        group.add(this.box(dims.w + 0.06, 0.18, dims.d + 0.06, strip, 0, 0.7, 0));
        const lamp = new THREE.Mesh(this.sphere(), this.basic(stripColor));
        lamp.scale.setScalar(0.34);
        lamp.position.set(0, dims.h + 0.22, 0);
        group.add(lamp);
        break;
      }
      case 'train': {
        // Long metro car — the signature "dodge the train" obstacle.
        const trainTex = this.tex('train', () => makeTrainTexture());
        const carMat = this.mat('traincar', () =>
          new THREE.MeshStandardMaterial({
            map: trainTex,
            roughness: 0.45,
            metalness: 0.55,
          }),
        );
        const length = dims.d;
        const body = this.box(dims.w, dims.h, length, carMat, 0, dims.h / 2, 0);
        body.castShadow = this.preset.shadows;
        group.add(body);
        const roof = this.std(0x1c2033, 0.7, 0.4);
        group.add(this.box(dims.w - 0.2, 0.16, length - 0.4, roof, 0, dims.h + 0.06, 0));
        // Headlights on the approaching face (+z faces the player).
        const head = this.basic(0xfff6d8);
        group.add(this.box(0.3, 0.22, 0.08, head, -0.6, 0.9, length / 2 + 0.02));
        group.add(this.box(0.3, 0.22, 0.08, head, 0.6, 0.9, length / 2 + 0.02));
        const tailGlow = this.std(0xff4d4d, 0.4, 0.2, 0xff4d4d, 1.8);
        group.add(this.box(dims.w - 0.3, 0.1, 0.06, tailGlow, 0, dims.h - 0.35, length / 2 + 0.02));
        break;
      }
    }
    return group;
  }

  buildCoin(): THREE.Mesh {
    const geo = this.cachedGeometry('coin', () => new THREE.CylinderGeometry(0.36, 0.36, 0.09, 18));
    const faceTex = this.tex('coin', () => makeCoinTexture());
    const sideMat = this.mat('coin-side', () =>
      new THREE.MeshStandardMaterial({
        color: 0xffc23c,
        emissive: 0xc98200,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.7,
      }),
    );
    const faceMat = this.mat('coin-face', () =>
      new THREE.MeshStandardMaterial({
        map: faceTex,
        emissive: 0xffa000,
        emissiveIntensity: 0.45,
        roughness: 0.35,
        metalness: 0.6,
      }),
    );
    const coin = new THREE.Mesh(geo, [sideMat, faceMat, faceMat]);
    coin.rotation.x = Math.PI / 2; // face the oncoming player
    return coin;
  }

  buildPowerUp(kind: PowerUpKind): THREE.Group {
    const colors: Record<PowerUpKind, number> = {
      magnet: 0xffc23c,
      shield: 0x39d0ff,
      multiplier: 0xff4fd8,
      jet: 0x7dff6a,
    };
    const color = colors[kind];
    const group = new THREE.Group();
    const coreMat = this.mat(`pu-core-${kind}`, () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.4,
      }),
    );
    const core = new THREE.Mesh(this.octahedron(), coreMat);
    core.scale.setScalar(0.72);
    group.add(core);

    const ringMat = this.mat(`pu-ring-${kind}`, () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }),
    );
    const ring = new THREE.Mesh(this.torus(), ringMat);
    ring.scale.setScalar(1.15);
    ring.name = 'ring';
    group.add(ring);

    // Kind-specific inner glyph built from primitives.
    switch (kind) {
      case 'magnet': {
        const arm = this.box(0.12, 0.4, 0.12, this.basic(0xffffff), -0.18, 0.05, 0);
        const arm2 = arm.clone();
        arm2.position.x = 0.18;
        const bridge = this.box(0.48, 0.12, 0.12, this.basic(0xffffff), 0, 0.25, 0);
        group.add(arm, arm2, bridge);
        break;
      }
      case 'shield': {
        const face = this.box(0.34, 0.42, 0.06, this.basic(0xffffff), 0, 0.04, 0);
        group.add(face);
        break;
      }
      case 'multiplier': {
        const bar = this.box(0.4, 0.09, 0.06, this.basic(0xffffff), 0, 0, 0);
        bar.rotation.z = Math.PI / 4;
        const bar2 = bar.clone();
        bar2.rotation.z = -Math.PI / 4;
        group.add(bar, bar2);
        break;
      }
      case 'jet': {
        const flame = new THREE.Mesh(this.cone(), this.basic(0xffffff));
        flame.scale.set(0.22, 0.5, 0.22);
        flame.rotation.x = Math.PI;
        flame.position.y = -0.16;
        group.add(flame);
        break;
      }
    }
    return group;
  }

  /** Animate shared emissive materials (warning lights, holo flicker). */
  update(time: number): void {
    const pulse = 1.1 + Math.sin(time * 6) * 0.9;
    for (const m of this.pulseMaterials) m.emissiveIntensity = pulse;
    for (const m of this.holoMaterials) m.opacity = 0.72 + Math.sin(time * 9 + 1.3) * 0.13;
  }

  /** Release every cached GPU resource (call on app teardown only). */
  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.decorPrototypes.clear();
    this.pulseMaterials = [];
    this.holoMaterials = [];
  }
}
