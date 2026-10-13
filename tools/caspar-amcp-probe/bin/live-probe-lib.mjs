// @ts-check
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

/**
 * THE LIVE PROBE HARNESS — a scripted, instrumented, pixel-asserting AMCP client.
 *
 * 🔴 **Why this exists beside `src/amcp-client.ts`.** That client is fire-and-forget:
 * `send()` writes a line, `linesSince()` scrapes whatever came back. Right for the C-001
 * escape sweep it was written for; exactly wrong here. The owner's 2026-08-15 plant
 * session was plagued by a console that concatenated two commands onto one line and
 * answered `#400`, and **twice a measurement was scored before anyone noticed**. So this
 * harness enforces the rule that would have caught it:
 *
 *   > **Never send a second command before the first has answered**, and treat any
 *   > non-`2xx` as a HARD FAILURE of the measurement rather than a warning.
 *
 * ⭐ **Every probe carries a VALIDITY GATE that runs BEFORE the reading and can VOID it.**
 * A measurement whose setup was not verified is not a result — this project scored a null
 * run as a verdict once and it cost a session. A failed gate reports VOID, never a value:
 * a value with a broken setup is worse than no value, because it gets cited.
 *
 * **Plain ESM, no build step, no dependency.** That is deliberate and matches
 * `bin/lifecycle-probe.mjs` beside it: this runs at a plant, where `pnpm build` and
 * `node_modules` are the least available things in the building. The PNG decoder is
 * `zlib` (built in) plus twenty lines of defilter rather than an image library.
 */

/**
 * The production 2.5.0 install directory on the plant's playout box.
 *
 * ⭐ **CORRECTED 2026-08-25.** This read `D:\programs\casparcg-server-v2.5.0-stable-windows`,
 * with a `programs\` segment that is not there. The owner read the path off the RUNNING PROCESS
 * during the DeckLink walk (`docs/recon/2026-08-25-decklink-model-walk.md`, host
 * `192.168.21.114`, `VERSION SERVER` → `2.5.0 69e8ad5 Stable`).
 *
 * 🔴 **This is not cosmetic: {@link MEDIA} is `readdirSync`'d below.** A wrong root does not
 * degrade, it throws `ENOENT` at the plant — during the one visit the probe exists to make use
 * of, with the server already set up and the operator waiting.
 *
 * ⚠ **`D:\programs\CasparCG` is the RETIRED 2.3.2 and must never be probed.** It is a different
 * server, not a different spelling of this path.
 */
export const INSTALL = 'D:\\casparcg-server-v2.5.0-stable-windows';
export const MEDIA = path.join(INSTALL, 'media');
export const TEMPLATE = path.join(INSTALL, 'template');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── AMCP, strictly one command at a time ─────────────────────────

function connect(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => resolve(sock));
    sock.setEncoding('utf-8');
    sock.once('error', reject);
  });
}

/**
 * Open one AMCP connection that speaks strictly one command at a time.
 *
 * Completion is detected by a QUIET WINDOW rather than by parsing each verb's reply
 * shape: AMCP answers `INFO` with a multi-line XML body, `PRINT` with one line, and an
 * error with one line. A parser that had to know which is which would be a second model
 * of the protocol to keep correct, and these probes are not timing-sensitive at this layer.
 *
 * `busy` throws rather than queueing, so a caller that interleaves is CORRECTED instead of
 * silently serialised into an order it did not intend.
 */
export async function openAmcp(host = '127.0.0.1', port = 5250) {
  const sock = await connect(host, port);
  const trace = [];
  let busy = false;

  function command(line, { quietMs = 400, timeoutMs = 12_000, expectOk = true } = {}) {
    if (busy) return Promise.reject(new Error(`interleaved AMCP command refused: ${line}`));
    busy = true;
    return new Promise((resolve, reject) => {
      let buf = '';
      const lines = [];
      let quiet = null;
      const finish = () => {
        sock.off('data', onData);
        clearTimeout(hard);
        if (quiet) clearTimeout(quiet);
        busy = false;
        const m = /^(\d{3})/.exec(lines[0] ?? '');
        const code = m ? Number(m[1]) : Number.NaN;
        const reply = { sent: line, code, lines };
        trace.push(reply);
        if (expectOk && !(code >= 200 && code < 300)) {
          reject(new Error(`AMCP ${String(code)} for "${line}": ${lines.join(' | ')}`));
          return;
        }
        resolve(reply);
      };
      const onData = (chunk) => {
        buf += chunk;
        let i = buf.indexOf('\r\n');
        while (i >= 0) {
          lines.push(buf.slice(0, i));
          buf = buf.slice(i + 2);
          i = buf.indexOf('\r\n');
        }
        if (quiet) clearTimeout(quiet);
        quiet = setTimeout(finish, quietMs);
      };
      const hard = setTimeout(() => {
        sock.off('data', onData);
        busy = false;
        reject(new Error(`AMCP timeout after ${String(timeoutMs)}ms: ${line}`));
      }, timeoutMs);
      sock.on('data', onData);
      sock.write(`${line}\r\n`);
    });
  }

  const close = () => new Promise((r) => sock.end(() => r(undefined)));
  return { command, close, trace };
}

/**
 * 🔴 VALIDITY GATE — the install this probe is allowed to talk to, asserted not assumed.
 *
 * A retired CasparCG 2.3.2 still sits at `D:\programs\CasparCG`. Pointing a probe at it
 * and filing the answer as production is how a CEF-71 result becomes a 2.5.0 one — the
 * "warning that outlives its truth" defect, created rather than inherited. So the build
 * string is READ, CHECKED, and returned for recording beside every result.
 */
export async function assertProductionBuild(command) {
  const v = await command('VERSION');
  const build = (v.lines[1] ?? '').trim();
  if (!build.startsWith('2.5.0')) {
    throw new Error(
      `VOID — refusing to measure: expected the 2.5.0 production build, got "${build}". ` +
        'The retired 2.3.2 install must never be probed.',
    );
  }
  return build;
}

// ───────────────────────────────── PNG (PRINT read-back) ─────────────────────────────────

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decode a PNG to RGBA. DELIBERATELY NARROW — 8-bit, non-interlaced, truecolour with or
 * without alpha, which is what `PRINT` emits. Anything else THROWS with the value it
 * found rather than guessing: a decoder that silently mis-reads a frame turns a
 * measurement into a confident wrong answer, the one outcome worse than no measurement.
 */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let w = 0;
  let h = 0;
  let bd = 0;
  let ct = -1;
  let il = 0;
  const idat = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      bd = body.readUInt8(8);
      ct = body.readUInt8(9);
      il = body.readUInt8(12);
    } else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bd !== 8) throw new Error(`unsupported PNG bit depth ${String(bd)}`);
  if (il !== 0) throw new Error('unsupported interlaced PNG');
  if (ct !== 2 && ct !== 6) throw new Error(`unsupported PNG colour type ${String(ct)}`);
  if (idat.length === 0) throw new Error('PNG has no IDAT');

  const ch = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const f = raw[p];
    p += 1;
    for (let i = 0; i < stride; i += 1) cur[i] = raw[p + i] ?? 0;
    p += stride;
    const A = (i) => (i >= ch ? cur[i - ch] : 0);
    const B = (i) => prev[i];
    const C = (i) => (i >= ch ? prev[i - ch] : 0);
    if (f === 1) for (let i = 0; i < stride; i += 1) cur[i] = (cur[i] + A(i)) & 255;
    else if (f === 2) for (let i = 0; i < stride; i += 1) cur[i] = (cur[i] + B(i)) & 255;
    else if (f === 3)
      for (let i = 0; i < stride; i += 1) cur[i] = (cur[i] + ((A(i) + B(i)) >> 1)) & 255;
    else if (f === 4)
      for (let i = 0; i < stride; i += 1) cur[i] = (cur[i] + paeth(A(i), B(i), C(i))) & 255;
    else if (f !== 0) throw new Error(`unknown PNG filter ${String(f)} on row ${String(y)}`);
    for (let x = 0; x < w; x += 1) {
      const s = x * ch;
      const d = (y * w + x) * 4;
      out[d] = cur[s];
      out[d + 1] = cur[s + 1];
      out[d + 2] = cur[s + 2];
      out[d + 3] = ch === 4 ? cur[s + 3] : 255;
    }
    prev.set(cur);
  }
  return { width: w, height: h, data: out };
}

/**
 * The MEDIAN colour of a small patch at NORMALISED coordinates — what a real measurement
 * wants. A single pixel is hostage to compression ringing, one interlace scanline and a
 * stray antialiased edge. MEDIAN rather than mean deliberately: the mean of "mostly black
 * with a bright frame clipped into the patch" reports a grey that exists nowhere.
 */
export function patch(img, nx, ny, half = 8) {
  const cx = Math.round(nx * (img.width - 1));
  const cy = Math.round(ny * (img.height - 1));
  const R = [];
  const G = [];
  const B = [];
  for (let y = cy - half; y <= cy + half; y += 1) {
    for (let x = cx - half; x <= cx + half; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const d = (y * img.width + x) * 4;
      R.push(img.data[d]);
      G.push(img.data[d + 1]);
      B.push(img.data[d + 2]);
    }
  }
  const mid = (a) => {
    a.sort((p, q) => p - q);
    return a[Math.floor(a.length / 2)] ?? 0;
  };
  return { r: mid(R), g: mid(G), b: mid(B) };
}

export const hex = (c) =>
  `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

/** Chebyshev distance in RGB — the honest "is it this colour" test. */
export const colourDistance = (a, b) =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));

/** Luminance spread over a patch — distinguishes a flat fill from a picture. */
export function variance(img, nx, ny, half = 14) {
  const cx = Math.round(nx * (img.width - 1));
  const cy = Math.round(ny * (img.height - 1));
  let mn = 255;
  let mx = 0;
  for (let y = cy - half; y <= cy + half; y += 1) {
    for (let x = cx - half; x <= cx + half; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const d = (y * img.width + x) * 4;
      const l = 0.299 * img.data[d] + 0.587 * img.data[d + 1] + 0.114 * img.data[d + 2];
      mn = Math.min(mn, l);
      mx = Math.max(mx, l);
    }
  }
  return Math.round(mx - mn);
}

/**
 * Normalised x of every strong luminance edge on one row, with runs collapsed to their
 * midpoint. This is what turns "the band looked like it started a quarter in" into
 * "the edge is at 0.2503".
 */
export function edgesOnRow(img, ny, threshold = 40) {
  const y = Math.round(ny * (img.height - 1));
  const lum = (x) => {
    const d = (y * img.width + x) * 4;
    return 0.299 * img.data[d] + 0.587 * img.data[d + 1] + 0.114 * img.data[d + 2];
  };
  const hits = [];
  for (let x = 1; x < img.width; x += 1) {
    if (Math.abs(lum(x) - lum(x - 1)) >= threshold) hits.push(x / (img.width - 1));
  }
  const merged = [];
  let run = [];
  for (const e of hits) {
    if (run.length === 0 || e - run[run.length - 1] < 4 / img.width) run.push(e);
    else {
      merged.push(run.reduce((a, b) => a + b, 0) / run.length);
      run = [e];
    }
  }
  if (run.length > 0) merged.push(run.reduce((a, b) => a + b, 0) / run.length);
  return merged;
}

const listPngs = () => {
  try {
    return fs.readdirSync(MEDIA).filter((f) => f.toLowerCase().endsWith('.png'));
  } catch {
    return [];
  }
};

/**
 * `PRINT` channel N and return the decoded frame it wrote.
 *
 * ⚠ `PRINT` names its file from a whole-SECOND timestamp, so two captures inside one
 * second collide. The new file is found by DIFFING the directory rather than by computing
 * the name — and if none appears, that is a VOID measurement, not a retry. The file also
 * appears before it is fully written, so its size is waited out; decoding a half-written
 * PNG is exactly the kind of confident wrong answer this harness exists to prevent.
 */
export async function capture(command, channel = 1) {
  const before = new Set(listPngs());
  await command(`PRINT ${String(channel)}`);
  const deadline = Date.now() + 8000;
  let fresh = null;
  while (Date.now() < deadline) {
    await sleep(150);
    const now = listPngs().filter((f) => !before.has(f));
    if (now.length > 0) {
      fresh = now[now.length - 1];
      break;
    }
  }
  if (fresh === null) throw new Error('VOID — PRINT produced no new PNG within 8s');
  const full = path.join(MEDIA, fresh);
  let last = -1;
  for (let i = 0; i < 40; i += 1) {
    const size = fs.statSync(full).size;
    if (size === last && size > 0) break;
    last = size;
    await sleep(60);
  }
  return { img: decodePng(fs.readFileSync(full)), file: fresh };
}
