import * as THREE from 'three';

/**
 * Procedural canvas textures — the game ships ZERO binary image assets.
 * Everything (neon signs, holo ads, building windows, train skins, track
 * surface, particles) is drawn at runtime into CanvasTextures, which also
 * demonstrates UV mapping / texture pipelines for the CG report.
 */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unsupported');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** Dark building facade with a grid of lit windows (warm/cool mix). */
export function makeWindowTexture(seed = 7): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 512);
  ctx.fillStyle = '#0a0c18';
  ctx.fillRect(0, 0, 256, 512);
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const colors = ['#ffd9a0', '#9fd8ff', '#ff9ad5', '#a0ffe0', '#ffe9b0'];
  const cols = 8;
  const rows = 16;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rand() < 0.42) {
        ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
        ctx.globalAlpha = 0.25 + rand() * 0.7;
        ctx.fillRect(c * 32 + 8, r * 32 + 8, 16, 20);
      }
    }
  }
  ctx.globalAlpha = 1;
  // Floor separator lines.
  ctx.strokeStyle = 'rgba(120,140,255,0.08)';
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * 32);
    ctx.lineTo(256, r * 32);
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** Neon shop sign with fictional text — emissive map friendly. */
export function makeSignTexture(
  text: string,
  mainColor: string,
  accentColor: string,
): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, w, h);

  // Glow border.
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 18;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Text with neon bloom.
  ctx.shadowColor = mainColor;
  ctx.shadowBlur = 24;
  ctx.fillStyle = mainColor;
  ctx.font = 'bold 52px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, w / 2, h / 2 + 2);
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

/** Holographic advertisement panel with scanlines. */
export function makeHoloTexture(lines: string, hue: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = 'rgba(4,10,20,0.9)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = hue;
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 244, 244);

  ctx.fillStyle = hue;
  ctx.shadowColor = hue;
  ctx.shadowBlur = 12;
  ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  const split = lines.split('\n');
  split.forEach((line, i) => {
    ctx.fillText(line, 128, 100 + i * 36);
  });

  // Scanlines.
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#bff4ff';
  for (let y = 0; y < 256; y += 6) ctx.fillRect(0, y, 256, 2);
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

/** Metallic track / platform surface with lane guides. */
export function makeTrackTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#31364e';
  ctx.fillRect(0, 0, 256, 256);
  // Panel seams.
  ctx.strokeStyle = 'rgba(150,175,255,0.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.stroke();
  }
  // Subtle noise speckle.
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = `rgba(180,200,255,${Math.random() * 0.05})`;
    ctx.fillRect(x, y, 2, 2);
  }
  return toTexture(canvas, 2, 8);
}

/** Metro train car side: panels + window strip + livery stripe. */
export function makeTrainTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3a4152');
  grad.addColorStop(0.5, '#232838');
  grad.addColorStop(1, '#171b28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Windows.
  ctx.fillStyle = '#bfe9ff';
  ctx.shadowColor = '#7fd4ff';
  ctx.shadowBlur = 14;
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(24 + i * 80, 44, 56, 44);
  }
  ctx.shadowBlur = 0;

  // Livery stripes (original saffron-white-green inspired motif).
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(0, 120, 512, 12);
  ctx.fillStyle = '#f5f7ff';
  ctx.fillRect(0, 132, 512, 12);
  ctx.fillStyle = '#37d67a';
  ctx.fillRect(0, 144, 512, 12);

  // Panel seams + rivets.
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 85, 0);
    ctx.lineTo(i * 85, 256);
    ctx.stroke();
  }
  return toTexture(canvas, 2, 1);
}

/** Coin face: hexagonal "N" token (original fictional currency). */
export function makeCoinTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.6, '#ffc23c');
  grad.addColorStop(1, '#c98200');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a4d00';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Hexagon emblem.
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = 64 + Math.cos(a) * 38;
    const y = 64 + Math.sin(a) * 38;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#8a5a00';
  ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 64, 67);
  return toTexture(canvas);
}

/** Soft radial sprite used by the particle system. */
export function makeParticleTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Barrier hazard stripes (original, no branding). */
export function makeStripeTexture(colorA: string, colorB: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = colorB;
  for (let i = -2; i < 6; i++) {
    ctx.save();
    ctx.translate(i * 32, 0);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 0);
    ctx.lineTo(48, 128);
    ctx.lineTo(32, 128);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return toTexture(canvas, 2, 1);
}

/** Tunnel wall tiles with a glowing conduit line. */
export function makeTunnelTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#101220';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(90,110,190,0.25)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  for (let x = 0; x <= 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  // Glowing conduit.
  ctx.strokeStyle = '#39d0ff';
  ctx.shadowColor = '#39d0ff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.lineTo(256, 40);
  ctx.stroke();
  return toTexture(canvas, 2, 1);
}
