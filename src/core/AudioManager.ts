/**
 * Fully procedural Web Audio engine — zero external audio assets, so nothing
 * can 404 and licensing is unambiguous.
 *
 * - Background music: a scheduled neon-synth loop (bass + arpeggio + pads +
 *   hi-hat noise) in a raga-flavoured minor scale.
 * - SFX: oscillator / noise-buffer synthesis (coin, jump, slide, power-up,
 *   hit, game over, UI click).
 *
 * The AudioContext is created only after the first user gesture (autoplay
 * policy). Every call is guarded: if audio init fails the game still runs.
 */

import { GameSettings } from '../config/gameConfig';

type SfxName =
  | 'coin'
  | 'jump'
  | 'slide'
  | 'powerup'
  | 'hit'
  | 'gameover'
  | 'click'
  | 'shieldbreak';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private failed = false;

  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private musicPlaying = false;

  private settings: GameSettings;

  // A minor pentatonic-ish scale with a raised 4th — "neon raga" flavour.
  private readonly scale = [220, 261.63, 293.66, 329.63, 392.0, 440, 523.25, 587.33];
  private readonly bassPattern = [0, 0, 3, 0, 5, 0, 3, 2];
  private readonly tempo = 0.14; // seconds per 8th step

  constructor(settings: GameSettings) {
    this.settings = { ...settings };
  }

  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.updateGains();
  }

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.failed) return;
    if (!this.ctx) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain.connect(this.master);
        this.sfxGain.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.createNoiseBuffer();
        this.updateGains();
      } catch (err) {
        console.warn('[audio] init failed, continuing silently', err);
        this.failed = true;
        return;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
  }

  private updateGains(): void {
    if (!this.master || !this.musicGain || !this.sfxGain) return;
    const masterVol = this.settings.muted ? 0 : this.settings.masterVolume;
    this.master.gain.value = masterVol;
    this.musicGain.gain.value = this.settings.musicVolume;
    this.sfxGain.gain.value = this.settings.sfxVolume;
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const length = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------------------------------------------------------------- music

  startMusic(): void {
    if (this.failed || !this.ctx) return;
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextNoteTime = this.now + 0.08;
    this.musicTimer = window.setInterval(this.musicScheduler, 45);
  }

  stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMusicIntensity(intense: boolean): void {
    this.tempoScale = intense ? 0.86 : 1;
  }

  private tempoScale = 1;

  private musicScheduler = (): void => {
    if (!this.ctx || !this.musicPlaying) return;
    const horizon = this.now + 0.25;
    while (this.nextNoteTime < horizon) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this.tempo * this.tempoScale;
      this.step = (this.step + 1) % 32;
    }
  };

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.musicGain) return;
    const bar = step % 8;

    // Bass line.
    const bassNote = this.scale[this.bassPattern[bar]] / 2;
    this.tone(bassNote, time, 0.16, 'sawtooth', 0.16, this.musicGain, 400);

    // Arpeggio every 8th, alternating up the scale.
    const arpIdx = (step * 3 + Math.floor(step / 8)) % this.scale.length;
    if (step % 2 === 0) {
      this.tone(this.scale[arpIdx], time + 0.01, 0.09, 'square', 0.045, this.musicGain, 2600);
    }

    // Pad chord on bar start.
    if (bar === 0) {
      const root = this.scale[0];
      this.tone(root, time, 1.0, 'sine', 0.05, this.musicGain, 1200);
      this.tone(root * 1.5, time, 1.0, 'sine', 0.035, this.musicGain, 1200);
      this.tone(root * 1.185, time, 1.0, 'triangle', 0.03, this.musicGain, 1000);
    }

    // Hi-hat noise on off-beats.
    if (step % 2 === 1) {
      this.noise(time, 0.035, 0.028, 7000, this.musicGain);
    }
    // Kick on 1 and 5.
    if (bar === 0 || bar === 4) {
      this.kick(time, this.musicGain);
    }
  }

  // ------------------------------------------------------------------ sfx

  play(name: SfxName): void {
    if (this.failed || !this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') return;
    const t = this.now;
    switch (name) {
      case 'coin':
        this.tone(1180, t, 0.07, 'sine', 0.22, this.sfxGain);
        this.tone(1760, t + 0.05, 0.09, 'sine', 0.18, this.sfxGain);
        break;
      case 'jump':
        this.sweep(300, 620, t, 0.14, 'triangle', 0.2, this.sfxGain);
        break;
      case 'slide':
        this.noise(t, 0.22, 0.12, 900, this.sfxGain, 2600);
        break;
      case 'powerup':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(f, t + i * 0.06, 0.14, 'square', 0.1, this.sfxGain!),
        );
        break;
      case 'hit':
        this.kick(t, this.sfxGain, 0.5);
        this.noise(t, 0.25, 0.3, 400, this.sfxGain);
        this.sweep(220, 55, t, 0.3, 'sawtooth', 0.25, this.sfxGain);
        break;
      case 'shieldbreak':
        this.sweep(900, 180, t, 0.25, 'square', 0.16, this.sfxGain);
        this.noise(t, 0.18, 0.14, 3000, this.sfxGain);
        break;
      case 'gameover':
        [440, 349.23, 293.66, 220].forEach((f, i) =>
          this.tone(f, t + i * 0.18, 0.34, 'sawtooth', 0.14, this.sfxGain!, 900),
        );
        break;
      case 'click':
        this.tone(880, t, 0.045, 'square', 0.06, this.sfxGain);
        break;
    }
  }

  // ------------------------------------------------------- synth helpers

  private tone(
    freq: number,
    time: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    dest: AudioNode,
    lowpass?: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    let node: AudioNode = osc;
    if (lowpass) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      osc.connect(filter);
      node = filter;
    }
    node.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private sweep(
    from: number,
    to: number,
    time: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    dest: AudioNode,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), time + duration);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private noise(
    time: number,
    duration: number,
    gain: number,
    freq: number,
    dest: AudioNode,
    highpass = 1000,
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    src.connect(filter);
    filter.connect(hp);
    hp.connect(g);
    g.connect(dest);
    src.start(time);
    src.stop(time + duration + 0.05);
  }

  private kick(time: number, dest: AudioNode, gain = 0.32): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  dispose(): void {
    this.stopMusic();
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}
