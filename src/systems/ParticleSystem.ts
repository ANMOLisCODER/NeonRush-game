import * as THREE from 'three';
import { makeParticleTexture } from '../world/Textures';

/**
 * GPU-friendly particle system: a single THREE.Points cloud driven by a
 * custom ShaderMaterial (per-particle size, colour and alpha attributes).
 * All particles live in preallocated typed arrays — the pool never grows
 * during play (zero per-frame allocation).
 *
 * Demonstrates: alpha blending, additive compositing, custom GLSL shaders,
 * point sprites and object pooling.
 */

interface ParticleOptions {
  speed?: number;
  spread?: number;
  life?: number;
  size?: number;
  gravity?: number;
  upwardBias?: number;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private max: number;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private gravityArr: Float32Array;
  private cursor = 0;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private texture: THREE.Texture;

  constructor(max: number) {
    this.max = Math.max(32, max);
    const n = this.max;
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.alphas = new Float32Array(n);
    this.velocities = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.gravityArr = new Float32Array(n);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('pcolor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('psize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('palpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 400);

    this.texture = makeParticleTexture();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.texture },
      },
      vertexShader: /* glsl */ `
        attribute vec3 pcolor;
        attribute float psize;
        attribute float palpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = pcolor;
          vAlpha = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (240.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 texel = texture2D(map, gl_PointCoord);
          if (texel.a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, 1.0) * texel * vAlpha;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Rebuild buffers when the quality preset changes the particle cap. */
  resize(max: number): void {
    if (max === this.max) return;
    const old = this.points;
    old.removeFromParent();
    this.geometry.dispose();
    this.max = Math.max(32, max);
    const ctor = this.constructor as typeof ParticleSystem;
    const fresh = new ctor(this.max);
    // Copy fresh buffers into this instance (keeps external references).
    this.positions = fresh.positions;
    this.colors = fresh.colors;
    this.sizes = fresh.sizes;
    this.alphas = fresh.alphas;
    this.velocities = fresh.velocities;
    this.life = fresh.life;
    this.maxLife = fresh.maxLife;
    this.gravityArr = fresh.gravityArr;
    this.geometry = fresh.geometry;
    this.points.geometry = fresh.geometry;
    // The temporary instance's own material/texture are no longer needed.
    fresh.material.dispose();
    fresh.texture.dispose();
    this.cursor = 0;
  }

  private nextSlot(): number {
    // Round-robin with a short scan for a dead slot.
    for (let attempt = 0; attempt < 8; attempt++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      if (this.life[i] <= 0) return i;
    }
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    return i;
  }

  spawn(
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    opts: ParticleOptions = {},
  ): void {
    const i = this.nextSlot();
    const speed = opts.speed ?? 3;
    const spread = opts.spread ?? 1;
    const life = opts.life ?? 0.6;
    this.positions[i * 3] = x + (Math.random() - 0.5) * 0.15;
    this.positions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.15;
    this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.15;
    this.velocities[i * 3] = (Math.random() - 0.5) * speed * spread;
    this.velocities[i * 3 + 1] =
      (Math.random() - 0.3) * speed + (opts.upwardBias ?? 0);
    this.velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * spread;
    const c = new THREE.Color(color);
    this.colors[i * 3] = c.r;
    this.colors[i * 3 + 1] = c.g;
    this.colors[i * 3 + 2] = c.b;
    this.sizes[i] = opts.size ?? 0.34;
    this.alphas[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravityArr[i] = opts.gravity ?? -7;
  }

  burst(
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    count: number,
    opts: ParticleOptions = {},
  ): void {
    for (let n = 0; n < count; n++) this.spawn(x, y, z, color, opts);
  }

  getActiveCount(): number {
    let n = 0;
    for (let i = 0; i < this.max; i++) if (this.life[i] > 0) n++;
    return n;
  }

  update(dt: number): void {
    const pos = this.positions;
    const vel = this.velocities;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      vel[i * 3 + 1] += this.gravityArr[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alphas[i] = t;
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('palpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('pcolor') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alphas.fill(0);
    this.sizes.fill(0);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
