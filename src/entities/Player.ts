import * as THREE from 'three';
import { CHARACTER_VARIANTS, LANE, PLAYER, laneToX } from '../config/gameConfig';
import { AABB } from '../utils/constants';
import { clamp, damp } from '../utils/math';

type Pose = 'run' | 'jump' | 'slide' | 'hit' | 'jet';

interface LimbRefs {
  thighL: THREE.Group;
  thighR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  scarf: THREE.Mesh;
}

/**
 * Original stylised runner built from a hierarchy of primitive groups
 * (hips -> torso -> head/arms, hips -> thighs -> shins) and animated 100%
 * procedurally: run cycle, jump tuck, slide crouch, hit stagger, lane lean,
 * landing squash and hoverboard pose. Demonstrates hierarchical modelling
 * and keyframe-free animation driven by delta time.
 */
export class Player {
  readonly root: THREE.Group;
  private model: THREE.Group;
  private parts!: LimbRefs;
  private jacketMat!: THREE.MeshStandardMaterial;
  private pantsMat!: THREE.MeshStandardMaterial;
  private skinMat!: THREE.MeshStandardMaterial;
  private visorMat!: THREE.MeshStandardMaterial;
  private accentMat!: THREE.MeshStandardMaterial;
  private hairMat!: THREE.MeshStandardMaterial;

  readonly shieldMesh: THREE.Mesh;
  private magnetAura: THREE.Mesh;

  laneIndex = 0;
  private targetX = 0;
  private velY = 0;
  private airborne = false;
  private slideTimer = 0;
  private hitTimer = 0;
  private invincibleTimer = 0;
  private runPhase = 0;
  private pose: Pose = 'run';
  private squash = 1;

  /** Event flags consumed by Game each frame. */
  justLanded = false;
  justJumped = false;
  justSlid = false;

  jetActive = false;
  shieldActive = false;
  magnetActive = false;

  private box: AABB = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  constructor(variantIndex: number) {
    this.root = new THREE.Group();
    this.root.name = 'player-root';
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.build(variantIndex);

    // Shield bubble (hidden until the shield power-up is active).
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0x39d0ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.shieldMesh.position.y = 0.95;
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);

    // Magnet aura: rotating ring at the hips while the magnet is active.
    this.magnetAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffc23c,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.magnetAura.rotation.x = Math.PI / 2;
    this.magnetAura.position.y = 0.55;
    this.magnetAura.visible = false;
    this.root.add(this.magnetAura);
  }

  /** (Re)build the character rig with a colour variant. */
  private build(variantIndex: number): void {
    const v = CHARACTER_VARIANTS[clamp(variantIndex, 0, CHARACTER_VARIANTS.length - 1)];
    this.jacketMat = new THREE.MeshStandardMaterial({ color: v.jacket, roughness: 0.55, metalness: 0.25, emissive: v.jacket, emissiveIntensity: 0.22 });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: v.pants, roughness: 0.75, metalness: 0.15, emissive: v.pants, emissiveIntensity: 0.35 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: v.skin, roughness: 0.7, metalness: 0.05 });
    this.visorMat = new THREE.MeshStandardMaterial({ color: v.visor, emissive: v.visor, emissiveIntensity: 1.8, roughness: 0.25 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: v.accent, emissive: v.accent, emissiveIntensity: 1.1, roughness: 0.4 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: v.hair, roughness: 0.9 });

    // Remove previous rig if rebuilding.
    const old = this.model.getObjectByName('rig');
    if (old) {
      this.model.remove(old);
      old.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
    }

    const rig = new THREE.Group();
    rig.name = 'rig';
    const box = (w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.castShadow = true;
      return mesh;
    };

    // Hierarchy: hips at ~0.95m.
    const hips = new THREE.Group();
    hips.position.y = 0.92;
    rig.add(hips);

    const torso = new THREE.Group();
    hips.add(torso);
    const chest = box(0.52, 0.62, 0.3, this.jacketMat);
    chest.position.y = 0.3;
    torso.add(chest);
    const stripe = box(0.54, 0.07, 0.31, this.accentMat);
    stripe.position.y = 0.34;
    torso.add(stripe);
    const backpack = box(0.34, 0.4, 0.18, this.pantsMat);
    backpack.position.set(0, 0.3, 0.23);
    torso.add(backpack);
    const packGlow = box(0.1, 0.28, 0.02, this.accentMat);
    packGlow.position.set(0, 0.3, 0.33);
    torso.add(packGlow);

    // Head: skin + visor + hair cap + trailing scarf.
    const head = new THREE.Group();
    head.position.y = 0.72;
    torso.add(head);
    const skull = box(0.3, 0.32, 0.29, this.skinMat);
    skull.position.y = 0.14;
    head.add(skull);
    const hair = box(0.32, 0.14, 0.31, this.hairMat);
    hair.position.y = 0.29;
    head.add(hair);
    const visor = box(0.31, 0.1, 0.05, this.visorMat);
    visor.position.set(0, 0.16, -0.15);
    head.add(visor);
    const scarf = box(0.14, 0.42, 0.06, this.accentMat);
    scarf.position.set(0.02, 0.5, 0.16);
    torso.add(scarf);

    // Arms (pivot at shoulder).
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.33, 0.52, 0);
      const upper = box(0.13, 0.34, 0.14, this.jacketMat);
      upper.position.y = -0.17;
      arm.add(upper);
      const hand = box(0.11, 0.12, 0.12, this.skinMat);
      hand.position.y = -0.38;
      arm.add(hand);
      const band = box(0.14, 0.05, 0.15, this.accentMat);
      band.position.y = -0.28;
      arm.add(band);
      torso.add(arm);
      return arm;
    };

    // Legs (pivot at hip, knee child).
    const makeLeg = (side: number): { thigh: THREE.Group; shin: THREE.Group } => {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.15, -0.04, 0);
      const thighMesh = box(0.17, 0.42, 0.18, this.pantsMat);
      thighMesh.position.y = -0.21;
      thigh.add(thighMesh);
      const shin = new THREE.Group();
      shin.position.y = -0.42;
      const shinMesh = box(0.15, 0.4, 0.16, this.pantsMat);
      shinMesh.position.y = -0.2;
      shin.add(shinMesh);
      const shoe = box(0.17, 0.12, 0.3, this.accentMat);
      shoe.position.set(0, -0.42, -0.05);
      shin.add(shoe);
      thigh.add(shin);
      hips.add(thigh);
      return { thigh, shin };
    };

    const armL = makeArm(-1);
    const armR = makeArm(1);
    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    this.model.add(rig);
    this.parts = {
      thighL: legL.thigh,
      thighR: legR.thigh,
      shinL: legL.shin,
      shinR: legR.shin,
      armL,
      armR,
      torso,
      head,
      scarf,
    };
  }

  setVariant(index: number): void {
    this.build(index);
  }

  reset(): void {
    this.laneIndex = 0;
    this.targetX = 0;
    this.root.position.set(0, PLAYER.BASE_Y, PLAYER.FIXED_Z);
    this.root.rotation.set(0, 0, 0);
    this.model.rotation.set(0, 0, 0);
    this.model.scale.set(1, 1, 1);
    this.model.visible = true;
    this.velY = 0;
    this.airborne = false;
    this.slideTimer = 0;
    this.hitTimer = 0;
    this.invincibleTimer = 0;
    this.runPhase = 0;
    this.pose = 'run';
    this.squash = 1;
    this.jetActive = false;
    this.shieldActive = false;
    this.magnetActive = false;
    this.shieldMesh.visible = false;
    this.magnetAura.visible = false;
    this.justLanded = false;
    this.justJumped = false;
    this.justSlid = false;
  }

  // ------------------------------------------------------------ commands

  moveLeft(): boolean {
    if (this.laneIndex <= LANE.MIN_INDEX) return false;
    this.laneIndex -= 1;
    this.targetX = laneToX(this.laneIndex);
    return true;
  }

  moveRight(): boolean {
    if (this.laneIndex >= LANE.MAX_INDEX) return false;
    this.laneIndex += 1;
    this.targetX = laneToX(this.laneIndex);
    return true;
  }

  jump(): boolean {
    // No double-jump exploit: only when grounded (or jet re-boost downward cancel).
    if (this.airborne || this.jetActive) return false;
    this.slideTimer = 0; // jump cancels slide
    this.velY = PLAYER.JUMP_VELOCITY;
    this.airborne = true;
    this.justJumped = true;
    return true;
  }

  slide(): boolean {
    if (this.jetActive) return false;
    if (this.airborne) {
      // Fast-fall into a slide (skill move, prevents "jump then float").
      this.velY = Math.min(this.velY, -14);
      return false;
    }
    if (this.slideTimer > 0) return false;
    this.slideTimer = PLAYER.SLIDE_DURATION;
    this.justSlid = true;
    return true;
  }

  onHit(): void {
    this.hitTimer = 0.55;
    this.invincibleTimer = PLAYER.INVINCIBLE_TIME;
  }

  isInvincible(): boolean {
    return this.invincibleTimer > 0;
  }

  isSliding(): boolean {
    return this.slideTimer > 0 && !this.airborne;
  }

  getLane(): number {
    return this.laneIndex;
  }

  // -------------------------------------------------------------- update

  update(dt: number, speed: number, time: number): void {
    // Lateral movement: damped spring towards the target lane.
    const x = this.root.position.x;
    const newX = damp(x, this.targetX, PLAYER.LANE_LERP_SPEED, dt);
    const lateralVel = (newX - x) / Math.max(dt, 1e-4);
    this.root.position.x = newX;

    // Jump / gravity (semi-implicit Euler).
    if (this.jetActive) {
      const hoverY = 2.25 + Math.sin(time * 5.5) * 0.09;
      this.root.position.y = damp(this.root.position.y, hoverY, 8, dt);
      this.velY = 0;
      this.airborne = true;
    } else if (this.airborne) {
      this.velY += PLAYER.GRAVITY * dt;
      this.root.position.y += this.velY * dt;
      if (this.root.position.y <= PLAYER.BASE_Y) {
        this.root.position.y = PLAYER.BASE_Y;
        this.velY = 0;
        this.airborne = false;
        this.justLanded = true;
        this.squash = 0.78;
      }
    }

    // Timers.
    if (this.slideTimer > 0) this.slideTimer = Math.max(0, this.slideTimer - dt);
    if (this.hitTimer > 0) this.hitTimer = Math.max(0, this.hitTimer - dt);
    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
      // Blink while invincible.
      this.model.visible = Math.floor(this.invincibleTimer * 14) % 2 === 0;
      if (this.invincibleTimer === 0) this.model.visible = true;
    } else {
      this.model.visible = true;
    }

    // Pose resolution (priority: hit > jet > slide > jump > run).
    if (this.hitTimer > 0) this.pose = 'hit';
    else if (this.jetActive) this.pose = 'jet';
    else if (this.isSliding()) this.pose = 'slide';
    else if (this.airborne) this.pose = 'jump';
    else this.pose = 'run';

    this.animate(dt, speed, time, lateralVel);

    // Landing squash recovery.
    this.squash = damp(this.squash, 1, 10, dt);
    this.model.scale.set(1 + (1 - this.squash) * 0.5, this.squash, 1 + (1 - this.squash) * 0.5);

    // Magnet aura spins while active.
    this.magnetAura.visible = this.magnetActive;
    if (this.magnetActive) {
      this.magnetAura.rotation.z += dt * 3.2;
      const auraMat = this.magnetAura.material as THREE.MeshBasicMaterial;
      auraMat.opacity = 0.55 + Math.sin(time * 8) * 0.2;
    }

    // Shield bubble follows and shimmers.
    this.shieldMesh.visible = this.shieldActive;
    if (this.shieldActive) {
      const mat = this.shieldMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(time * 7) * 0.07;
      this.shieldMesh.rotation.y += dt * 1.4;
      this.shieldMesh.position.y = this.pose === 'slide' ? 0.6 : 0.95;
    }
  }

  private animate(dt: number, speed: number, time: number, lateralVel: number): void {
    const p = this.parts;
    this.runPhase += dt * (7 + speed * 0.3);
    const ph = this.runPhase;

    // Lean into lane changes + subtle yaw.
    const lean = clamp(-lateralVel * 0.045, -PLAYER.MAX_LEAN_ANGLE, PLAYER.MAX_LEAN_ANGLE);
    this.model.rotation.z = damp(this.model.rotation.z, lean, 10, dt);
    this.model.rotation.y = damp(this.model.rotation.y, lean * 0.55, 10, dt);

    // Forward speed tilt + hip height per pose.
    let hipsY = 0.92;
    const bodyTilt = 0.1 + speed * 0.004;
    const thighLAmp = 0.95;
    const armSwing = 1;

    switch (this.pose) {
      case 'run': {
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        p.thighL.rotation.x = s * thighLAmp;
        p.thighR.rotation.x = -s * thighLAmp;
        p.shinL.rotation.x = -Math.max(0, c) * 1.15 - 0.12;
        p.shinR.rotation.x = -Math.max(0, -c) * 1.15 - 0.12;
        p.armL.rotation.x = -s * 0.9 * armSwing;
        p.armR.rotation.x = s * 0.9 * armSwing;
        p.armL.rotation.z = 0.08;
        p.armR.rotation.z = -0.08;
        p.torso.rotation.x = bodyTilt;
        p.torso.position.y = Math.abs(Math.sin(ph * 2)) * 0.045;
        p.head.rotation.x = -bodyTilt * 0.7 + Math.sin(ph * 2) * 0.02;
        p.scarf.rotation.x = -0.4 - speed * 0.02 - Math.sin(ph * 3) * 0.12;
        p.thighL.position.y = -0.04;
        break;
      }
      case 'jump': {
        const tuck = clamp(this.velY > 0 ? 1 - this.velY / 9 : 0.55, 0.2, 1);
        p.thighL.rotation.x = -1.15 * tuck;
        p.thighR.rotation.x = -0.5 * tuck;
        p.shinL.rotation.x = -1.5 * tuck;
        p.shinR.rotation.x = -0.9 * tuck;
        p.armL.rotation.x = -2.3;
        p.armR.rotation.x = -2.1;
        p.armL.rotation.z = 0.35;
        p.armR.rotation.z = -0.35;
        p.torso.rotation.x = 0.12;
        p.torso.position.y = 0;
        p.scarf.rotation.x = -0.9;
        break;
      }
      case 'slide': {
        hipsY = 0.44;
        p.thighL.rotation.x = -1.45;
        p.thighR.rotation.x = -1.15;
        p.shinL.rotation.x = -0.35;
        p.shinR.rotation.x = -0.9;
        p.armL.rotation.x = 1.9;
        p.armR.rotation.x = -0.6;
        p.armL.rotation.z = 0.5;
        p.armR.rotation.z = -1.2;
        p.torso.rotation.x = -0.52;
        p.torso.position.y = 0;
        p.head.rotation.x = 0.45;
        p.scarf.rotation.x = -1.4;
        break;
      }
      case 'jet': {
        p.thighL.rotation.x = 0.35 + Math.sin(time * 9) * 0.06;
        p.thighR.rotation.x = 0.2;
        p.shinL.rotation.x = -0.5;
        p.shinR.rotation.x = -0.35;
        p.armL.rotation.x = 2.4;
        p.armR.rotation.x = 2.4;
        p.armL.rotation.z = 0.25;
        p.armR.rotation.z = -0.25;
        p.torso.rotation.x = 0.3;
        p.torso.position.y = 0;
        p.scarf.rotation.x = -1.6;
        break;
      }
      case 'hit': {
        const shake = Math.sin(this.hitTimer * 55) * 0.25;
        hipsY = 0.8;
        p.thighL.rotation.x = 0.4;
        p.thighR.rotation.x = -0.5;
        p.shinL.rotation.x = -0.4;
        p.shinR.rotation.x = -0.4;
        p.armL.rotation.x = -2.6 + shake;
        p.armR.rotation.x = -2.4 - shake;
        p.armL.rotation.z = 0.7;
        p.armR.rotation.z = -0.7;
        p.torso.rotation.x = -0.35;
        p.torso.rotation.z = shake * 0.5;
        p.torso.position.y = 0;
        p.head.rotation.x = 0.35;
        p.scarf.rotation.x = -0.2;
        break;
      }
    }

    // Apply hip height (damped so slides/stands transition smoothly).
    const rig = this.model.getObjectByName('rig');
    if (rig) {
      const hips = rig.children[0];
      hips.position.y = damp(hips.position.y, hipsY, 16, dt);
    }
    // Whole-model crouch offset for slide (keeps feet on ground).
    const crouchTarget = this.pose === 'slide' ? -0.42 : this.pose === 'hit' ? -0.08 : 0;
    this.model.position.y = damp(this.model.position.y, crouchTarget, 14, dt);
  }

  /** Current collision box in world space (reused object — no allocation). */
  getAABB(): AABB {
    const sliding = this.isSliding();
    const h = sliding ? PLAYER.HEIGHT_SLIDE : PLAYER.HEIGHT_STAND;
    const x = this.root.position.x;
    const y = this.root.position.y;
    const halfW = PLAYER.WIDTH / 2;
    const halfD = PLAYER.DEPTH / 2;
    const box = this.box;
    box.minX = x - halfW;
    box.maxX = x + halfW;
    box.minY = y;
    box.maxY = y + h;
    box.minZ = PLAYER.FIXED_Z - halfD;
    box.maxZ = PLAYER.FIXED_Z + halfD;
    return box;
  }

  /** Height of the collision box (for obstacle pass/fail checks in tests). */
  static collisionHeight(sliding: boolean): number {
    return sliding ? PLAYER.HEIGHT_SLIDE : PLAYER.HEIGHT_STAND;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((mat) => mat.dispose());
    });
  }
}
