import * as THREE from 'three';
import { CAMERA, DIFFICULTY } from '../config/gameConfig';
import { clamp, damp } from '../utils/math';

/**
 * Third-person follow camera: damped position tracking, speed-based FOV
 * widening, lane-change roll, landing dip, collision shake (optionally
 * reduced in settings) and look-ahead framing.
 */
export class CameraSystem {
  private shakeAmount = 0;
  private shakeSeedX = Math.random() * 100;
  private landingDip = 0;
  private currentFov: number = CAMERA.FOV_BASE;
  private lookTarget = new THREE.Vector3();
  shakeEnabled = true;

  constructor(private camera: THREE.PerspectiveCamera) {}

  reset(): void {
    this.shakeAmount = 0;
    this.landingDip = 0;
    this.currentFov = CAMERA.FOV_BASE;
    this.camera.fov = CAMERA.FOV_BASE;
    this.camera.rotation.set(0, 0, 0);
    this.camera.position.set(0, CAMERA.OFFSET_Y, CAMERA.OFFSET_Z);
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number): void {
    this.shakeAmount = Math.min(1.4, this.shakeAmount + amount);
  }

  addLandingDip(strength = 1): void {
    this.landingDip = Math.min(0.6, this.landingDip + CAMERA.LANDING_DIP * strength);
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    speed: number,
    lateralVelocity: number,
    time: number,
  ): void {
    // --- Position: behind + above, tracking the player laterally.
    const targetX = playerX * CAMERA.LATERAL_FOLLOW;
    const targetY = CAMERA.OFFSET_Y + playerY * 0.62 - this.landingDip;
    const targetZ = CAMERA.OFFSET_Z + playerY * 0.18;

    this.camera.position.x = damp(this.camera.position.x, targetX, CAMERA.POSITION_LERP, dt);
    this.camera.position.y = damp(this.camera.position.y, targetY, CAMERA.POSITION_LERP * 1.4, dt);
    this.camera.position.z = damp(this.camera.position.z, targetZ, CAMERA.POSITION_LERP, dt);

    // --- Look target with look-ahead and slight lateral lead.
    this.lookTarget.set(
      playerX * 0.82,
      1.25 + playerY * 0.65 - this.landingDip * 0.5,
      CAMERA.LOOK_AHEAD_Z,
    );
    this.camera.lookAt(this.lookTarget);

    // --- Roll lean during lane changes.
    const roll = clamp(-lateralVelocity * 0.012, -0.09, 0.09);
    this.camera.rotateZ(roll);

    // --- Speed-based FOV widening (damped to avoid nausea).
    const progress = clamp(
      (speed - DIFFICULTY.START_SPEED) / (DIFFICULTY.MAX_SPEED - DIFFICULTY.START_SPEED),
      0,
      1,
    );
    const targetFov = CAMERA.FOV_BASE + progress * (CAMERA.FOV_MAX - CAMERA.FOV_BASE);
    if (Math.abs(targetFov - this.currentFov) > 0.01) {
      this.currentFov = damp(this.currentFov, targetFov, 2.2, dt);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // --- Shake: decaying pseudo-random offsets (toggleable in settings).
    if (this.shakeAmount > 0.001 && this.shakeEnabled) {
      const s = this.shakeAmount * CAMERA.SHAKE_MAGNITUDE;
      this.camera.position.x += Math.sin(time * 57 + this.shakeSeedX) * s * 0.35;
      this.camera.position.y += Math.sin(time * 61 + this.shakeSeedX * 2) * s * 0.3;
      this.camera.rotateZ(Math.sin(time * 53) * s * 0.05);
      this.shakeAmount = Math.max(0, this.shakeAmount - CAMERA.SHAKE_DECAY * dt * this.shakeAmount - 0.15 * dt);
    } else if (!this.shakeEnabled) {
      this.shakeAmount = 0;
    }

    // --- Landing dip recovery.
    this.landingDip = damp(this.landingDip, 0, 7, dt);
  }
}
