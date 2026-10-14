// PNG-SEQUENCE-IMPORT-01 §0 — the alpha edge check. Reads one decoded RGBA frame (256 × 64) of a
// white-to-transparent ramp (source alpha = x, colour white everywhere) and reports, per column,
// how far the decoded alpha is from the source, and what the pixel composites to over BLACK and
// over WHITE. A straight-alpha pipeline keeps the colour white under every alpha, so over white
// it stays 255 (no dark fringe) and over black it is 255·a (no light fringe).
//
//   node tools/spikes/png-sequence/check-ramp.mjs <frame.rgba> [width=256] [height=64]
import { readFileSync } from 'node:fs';

const [file, w = '256', h = '64'] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const px = readFileSync(file);
const row = Math.floor(H / 2);
let maxAlphaErr = 0;
let worstOverWhite = 255;
let worstOverBlackErr = 0;
const samples = [];
for (let x = 0; x < W; x++) {
  const i = (row * W + x) * 4;
  const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
  const alphaErr = Math.abs(a - x);
  maxAlphaErr = Math.max(maxAlphaErr, alphaErr);
  const af = a / 255;
  const lum = (r + g + b) / 3;
  const overWhite = Math.round(lum * af + 255 * (1 - af));
  const overBlack = Math.round(lum * af);
  if (a > 0) worstOverWhite = Math.min(worstOverWhite, overWhite);
  worstOverBlackErr = Math.max(
    worstOverBlackErr,
    Math.abs(overBlack - Math.round(255 * (x / 255))),
  );
  if (x % 32 === 0 || x === W - 1) samples.push({ x, rgb: [r, g, b], a, overWhite, overBlack });
}
console.log(JSON.stringify({ maxAlphaErr, worstOverWhite, worstOverBlackErr, samples }, null, 1));
