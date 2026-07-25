// D-128 — MEASURE lossy-alpha leak: encode a premultiplied MOTION source with our
// VP8+alpha args, decode, and for pixels whose SOURCE alpha is exactly 0 report the
// OUTPUT alpha distribution, split static vs moving frames. Then repeat per quality
// point and with the alpha-bleed chain, measuring size + encode time.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
mkdirSync(DIR, { recursive: true });

// The owner's failing content is 1920-wide particle dissolves where the 2 Mbps cap BINDS
// (739 MB → 1.4 MB ≈ 500×). Model that: 720p, a PARTICLE BURST — hundreds of small soft
// textured particles, frozen for the first frames (static control) then dispersing fast.
const W = 1280,
  H = 720,
  FPS = 25,
  STATIC = 15,
  MOVING = 45,
  N = STATIC + MOVING;

let seed = 424242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const tex = new Float32Array(512 * 512);
for (let i = 0; i < tex.length; i++) tex[i] = 0.7 + rnd() * 0.3;

const PARTICLES = 260;
const parts = Array.from({ length: PARTICLES }, () => ({
  x: W * (0.25 + rnd() * 0.5),
  y: H * (0.25 + rnd() * 0.5),
  vx: (rnd() - 0.5) * 26,
  vy: (rnd() - 0.5) * 26,
  r: 5 + rnd() * 16,
  spin: rnd() * 6,
}));

const frames = Buffer.alloc(N * W * H * 4);
const srcAlpha = Buffer.alloc(N * W * H); // source alpha per pixel (for the leak sets)
for (let f = 0; f < N; f++) {
  const t = f < STATIC ? 0 : f - STATIC;
  const base = f * W * H * 4;
  const alphaF = Buffer.alloc(W * H); // per-frame alpha accumulation
  for (const p of parts) {
    const cx = p.x + p.vx * t + Math.sin(t / 4 + p.spin) * 3;
    const cy = p.y + p.vy * t + Math.cos(t / 4 + p.spin) * 3;
    const R = p.r,
      EDGE = Math.max(4, p.r * 0.8);
    const x0 = Math.max(0, Math.floor(cx - R - EDGE)),
      x1 = Math.min(W - 1, Math.ceil(cx + R + EDGE));
    const y0 = Math.max(0, Math.floor(cy - R - EDGE)),
      y1 = Math.min(H - 1, Math.ceil(cy + R + EDGE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        let a = 0;
        if (d <= R) a = 255;
        else if (d < R + EDGE) {
          const e = (d - R) / EDGE;
          a = Math.round(255 * Math.exp(-4 * e * e));
        }
        const pi = y * W + x;
        if (a > alphaF[pi]) alphaF[pi] = a;
      }
    }
  }
  for (let p = 0; p < W * H; p++) {
    const a = alphaF[p];
    srcAlpha[f * W * H + p] = a;
    if (a > 0) {
      const x = p % W,
        y = (p / W) | 0;
      const tv = tex[((y & 511) << 9) | (x & 511)];
      const i = base + p * 4;
      const r = Math.round(255 * tv),
        g = Math.round(215 * tv),
        b = Math.round(40 * tv);
      frames[i] = Math.round((r * a) / 255); // premultiplied
      frames[i + 1] = Math.round((g * a) / 255);
      frames[i + 2] = Math.round((b * a) / 255);
      frames[i + 3] = a;
    }
  }
}
const SRC = join(DIR, 'src.raw');
writeFileSync(SRC, frames);

const IN = [
  '-f',
  'rawvideo',
  '-pix_fmt',
  'rgba',
  '-s',
  `${W}x${H}`,
  '-framerate',
  String(FPS),
  '-i',
  SRC,
];
const BASE_VP8 = [
  '-c:v',
  'libvpx',
  '-pix_fmt',
  'yuva420p',
  '-auto-alt-ref',
  '0',
  '-deadline',
  'good',
  '-cpu-used',
  '5',
  '-an',
  '-g',
  '25',
];
const UNPREM =
  "geq=r='if(gt(alpha(X,Y),0),255*r(X,Y)/alpha(X,Y),0)':g='if(gt(alpha(X,Y),0),255*g(X,Y)/alpha(X,Y),0)':b='if(gt(alpha(X,Y),0),255*b(X,Y)/alpha(X,Y),0)':a='alpha(X,Y)'";
// Fix B — ALPHA BLEED. blur(premult RGB)/blur(alpha) = an opaque-weighted average of TRUE
// colour extended into transparent zones (mathematically the unpremultiply of a blurred
// premult image). Composite the straight image OVER the opaque bled backdrop (overlay uses
// straight alpha), then restore the ORIGINAL alpha untouched via alphamerge.
const BLEED =
  `[0:v]format=rgba,split=3[fs][fb][fa];` +
  `[fb]boxblur=12:2[bb];[bb]geq=r='if(gt(alpha(X,Y),4),255*r(X,Y)/alpha(X,Y),0)':g='if(gt(alpha(X,Y),4),255*g(X,Y)/alpha(X,Y),0)':b='if(gt(alpha(X,Y),4),255*b(X,Y)/alpha(X,Y),0)':a=255[bled];` +
  `[fs]${UNPREM}[straight];` +
  `[bled][straight]overlay=format=auto[comp];` +
  `[fa]alphaextract[am];[comp][am]alphamerge[out]`;

function encode(label, args, filterComplex) {
  const out = join(DIR, `${label.replace(/[^a-z0-9]/gi, '_')}.webm`);
  const t = Date.now();
  const fargs = filterComplex
    ? ['-filter_complex', filterComplex, '-map', '[out]']
    : ['-vf', UNPREM]; // production always unpremultiplies (archive default)
  const r = spawnSync(
    'ffmpeg',
    ['-y', ...IN, ...fargs, ...BASE_VP8, ...args, '-r', String(FPS), out],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(`ENCODE FAIL ${label}:`, r.stderr?.slice(-800));
    return null;
  }
  const ms = Date.now() - t;
  // decode back with libvpx (keeps alpha)
  const dec = join(DIR, `${label.replace(/[^a-z0-9]/gi, '_')}.dec.raw`);
  const d = spawnSync(
    'ffmpeg',
    ['-y', '-c:v', 'libvpx', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgba', dec],
    { encoding: 'utf8' },
  );
  if (d.status !== 0) {
    console.error(`DECODE FAIL ${label}`);
    return null;
  }
  return { out, dec, ms, bytes: statSync(out).size };
}

function measureLeak(decFile) {
  const buf = readFileSync(decFile);
  const nFrames = Math.min(N, Math.floor(buf.length / (W * H * 4)));
  const acc = {
    static: { n: 0, leak: 0, leak4: 0, leak8: 0, max: 0, blackLeak4: 0 },
    moving: { n: 0, leak: 0, leak4: 0, leak8: 0, max: 0, blackLeak4: 0 },
  };
  for (let f = 0; f < nFrames; f++) {
    const bucket = f < STATIC ? acc.static : acc.moving;
    const base = f * W * H * 4;
    for (let p = 0; p < W * H; p++) {
      if (srcAlpha[f * W * H + p] !== 0) continue; // only SOURCE-transparent pixels
      bucket.n++;
      const a = buf[base + p * 4 + 3];
      if (a > 0) {
        bucket.leak++;
        if (a > bucket.max) bucket.max = a;
        if (a >= 4) {
          bucket.leak4++;
          // is the leaked pixel BLACK (the visible smudge) or plausible colour (bleed)?
          const r = buf[base + p * 4],
            g = buf[base + p * 4 + 1];
          if (r < 60 && g < 60) bucket.blackLeak4++;
        }
        if (a >= 8) bucket.leak8++;
      }
    }
  }
  const fmt = (b) =>
    b.n === 0
      ? 'n/a'
      : `leak>0: ${((b.leak / b.n) * 100).toFixed(2)}%  ≥4: ${((b.leak4 / b.n) * 100).toFixed(3)}%  ≥8: ${((b.leak8 / b.n) * 100).toFixed(3)}%  maxα: ${b.max}  BLACK(of ≥4): ${((b.blackLeak4 / Math.max(1, b.leak4)) * 100).toFixed(0)}%`;
  return { static: fmt(acc.static), moving: fmt(acc.moving) };
}

const variants = [
  { label: 'CURRENT crf12 b2M', args: ['-crf', '12', '-b:v', '2M'] },
  { label: 'A1 crf10 b8M', args: ['-crf', '10', '-b:v', '8M'] },
  { label: 'A2 crf4 b20M qmax16', args: ['-crf', '4', '-b:v', '20M', '-qmax', '16'] },
  { label: 'A3 qmax8 b50M', args: ['-crf', '4', '-b:v', '50M', '-qmin', '0', '-qmax', '8'] },
  { label: 'B bleed + CURRENT', args: ['-crf', '12', '-b:v', '2M'], bleed: true },
  { label: 'A2+B bleed', args: ['-crf', '4', '-b:v', '20M', '-qmax', '16'], bleed: true },
];
console.log(
  `${W}x${H}, ${N} frames (${STATIC} static + ${MOVING} moving) @ ${FPS}fps, premultiplied gold disc, soft edge, moving texture. -g 25.\n`,
);
for (const v of variants) {
  const enc = encode(v.label, v.args, v.bleed ? BLEED : null);
  if (!enc) continue;
  const leak = measureLeak(enc.dec);
  const kbps = ((enc.bytes * 8) / (N / FPS) / 1000).toFixed(0);
  console.log(`■ ${v.label}`);
  console.log(`    size=${(enc.bytes / 1024).toFixed(0)}KiB (${kbps}kbps)  encode=${enc.ms}ms`);
  console.log(`    STATIC frames: ${leak.static}`);
  console.log(`    MOVING frames: ${leak.moving}\n`);
}
