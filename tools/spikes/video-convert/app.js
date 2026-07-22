// D-128 Phase 1 spike — page logic. Plain browser ESM, no bundler (spikes convention).
//
// Everything loads same-origin (serve.mjs maps /vendor/* → node_modules/@ffmpeg/*):
// the page boots WITHOUT the wasm (decision (e)); the core loads on first convert.

import { FFmpeg } from '/vendor/ffmpeg/index.js';

// ---------------------------------------------------------------- state

const $ = (id) => document.getElementById(id);

const state = {
  ffmpeg: null, // lazy — decision (e)
  file: null, // currently mounted input File
  mounted: false,
  converting: false,
  cancelled: false,
  outputs: {}, // codec → { bytes, blobUrl, ms, size }
  heapSampler: null,
  peakHeap: 0,
  metrics: {
    userAgent: navigator.userAgent,
    wasmDelivery:
      'npm @ffmpeg/ffmpeg 0.12.15 + @ffmpeg/core 0.12.10 (single-thread), same-origin /vendor/*',
    flags: {
      vp9: '-c:v libvpx-vp9 -pix_fmt yuva420p -crf 32 -b:v 0 -deadline good -cpu-used 5 -an',
      vp8: '-c:v libvpx -pix_fmt yuva420p -auto-alt-ref 0 -crf 12 -b:v 2M -deadline good -cpu-used 5 -an',
    },
    input: null,
    conversions: [],
    seek: null,
    drift: null,
  },
};
window.__spike = state; // hook for the automated test (test.mjs)

function log(msg) {
  const el = $('log');
  el.textContent = (el.textContent + '\n' + msg).split('\n').slice(-14).join('\n');
  console.log('[spike]', msg);
}

function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ---------------------------------------------------------------- ffmpeg lifecycle

async function ensureLoaded() {
  if (state.ffmpeg) return state.ffmpeg;
  const t0 = performance.now();
  const ff = new FFmpeg();
  ff.on('log', ({ message }) => log(message));
  ff.on('progress', ({ progress, time }) => {
    $('progress').textContent =
      `progress ${(progress * 100).toFixed(1)}% (t=${(time / 1_000_000).toFixed(2)}s)`;
  });
  await ff.load({
    coreURL: new URL('/vendor/core/ffmpeg-core.js', location.href).href,
    wasmURL: new URL('/vendor/core/ffmpeg-core.wasm', location.href).href,
  });
  state.ffmpeg = ff;
  state.metrics.wasmLoadMs = Math.round(performance.now() - t0);
  log(`core loaded in ${state.metrics.wasmLoadMs} ms (lazy — page booted without it)`);
  return ff;
}

async function mountInput(file) {
  const ff = await ensureLoaded();
  if (state.mounted) {
    try {
      await ff.unmount('/mnt');
    } catch {
      /* fresh instance after terminate has no mount */
    }
  }
  try {
    await ff.createDir('/mnt');
  } catch {
    /* exists */
  }
  // WORKERFS: the File is read LAZILY inside the worker (FileReaderSync) — never
  // copied wholesale into wasm memory. This is the bounded-memory claim (C2).
  await ff.mount('WORKERFS', { files: [file] }, '/mnt');
  state.mounted = true;
  state.file = file;
  state.metrics.input = { name: file.name, size: file.size, sizeMB: fmtMB(file.size) };
  $('input-info').textContent = `${file.name} — ${fmtMB(file.size)} (WORKERFS-mounted, lazy)`;
  log(`mounted ${file.name} (${fmtMB(file.size)}) via WORKERFS`);
}

function startHeapSampler() {
  state.peakHeap = 0;
  state.heapSampler = setInterval(() => {
    const m = performance.memory; // Chrome-only, approximate
    if (m && m.usedJSHeapSize > state.peakHeap) state.peakHeap = m.usedJSHeapSize;
  }, 200);
}

function stopHeapSampler() {
  clearInterval(state.heapSampler);
  state.heapSampler = null;
}

const ARGS = {
  vp9: [
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuva420p',
    '-crf',
    '32',
    '-b:v',
    '0',
    '-deadline',
    'good',
    '-cpu-used',
    '5',
    '-an',
  ],
  vp8: [
    '-c:v',
    'libvpx',
    '-pix_fmt',
    'yuva420p',
    '-auto-alt-ref',
    '0',
    '-crf',
    '12',
    '-b:v',
    '2M',
    '-deadline',
    'good',
    '-cpu-used',
    '5',
    '-an',
  ],
};

async function convert(codec) {
  if (!state.file) {
    log('no input mounted');
    return null;
  }
  if (state.converting) return null;
  state.converting = true;
  state.cancelled = false;
  $('progress').textContent = 'starting…';
  const ff = await ensureLoaded();
  const out = `/out-${codec}.webm`;
  startHeapSampler();
  const t0 = performance.now();
  try {
    let code;
    try {
      code = await ff.exec(['-y', '-i', `/mnt/${state.file.name}`, ...ARGS[codec], out]);
    } catch (err) {
      // KNOWN: libvpx-vp9 ENCODE crashes the 0.12.10 single-thread core with a wasm
      // "memory access out of bounds" (VP8 is fine). The worker is dead — reset so the
      // page stays usable; the operator re-selects the input to remount.
      stopHeapSampler();
      state.ffmpeg = null;
      state.mounted = false;
      state.metrics.conversions.push({ codec, failed: String(err) });
      log(
        `${codec} CRASHED the wasm worker (${err}) — known core bug for VP9 encode; re-select the input to remount`,
      );
      return null;
    }
    const ms = Math.round(performance.now() - t0);
    stopHeapSampler();
    if (code !== 0) {
      state.metrics.conversions.push({
        codec,
        failed: `ffmpeg exited ${code}${state.cancelled ? ' (cancelled)' : ''}`,
      });
      log(`ffmpeg exited ${code} — ${state.cancelled ? 'cancelled' : 'FAILED'}`);
      return null;
    }
    const bytes = await ff.readFile(out);
    await ff.deleteFile(out).catch?.(() => {});
    const rec = {
      codec,
      ms,
      inputSize: state.file.size,
      outputSize: bytes.length,
      outputSizeMB: fmtMB(bytes.length),
      peakJsHeap: state.peakHeap,
      peakJsHeapMB: fmtMB(state.peakHeap),
      heapNote:
        'performance.memory.usedJSHeapSize — Chrome-only, approximate; wasm linear memory not fully included',
    };
    state.metrics.conversions.push(rec);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
    state.outputs[codec] = { bytes, blobUrl, ms, size: bytes.length };
    $(`out-${codec}`).textContent =
      `${codec.toUpperCase()}: ${fmtMB(bytes.length)} in ${(ms / 1000).toFixed(1)}s — codec box: ${sniffCodec(bytes)}`;
    $('player').src = blobUrl;
    log(
      `${codec} done: ${fmtMB(bytes.length)} in ${(ms / 1000).toFixed(1)}s, peak JS heap ${fmtMB(state.peakHeap)}`,
    );
    return rec;
  } finally {
    state.converting = false;
    stopHeapSampler();
  }
}

function cancel() {
  if (!state.ffmpeg || !state.converting) return;
  state.cancelled = true;
  state.ffmpeg.terminate(); // hard kill — documented-allowed; remount required after
  state.ffmpeg = null;
  state.mounted = false;
  state.converting = false;
  log('terminated. Re-select / re-load the input to remount, then convert again.');
}

/** Find the Matroska CodecID string in the first 4 KB. */
function sniffCodec(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  if (head.includes('V_VP9')) return 'V_VP9';
  if (head.includes('V_VP8')) return 'V_VP8';
  return 'unknown';
}

// ---------------------------------------------------------------- seek harness (deliverable 5)

async function seekHarness() {
  const src = state.outputs.vp9 ?? state.outputs.vp8;
  if (!src) {
    log('convert something first');
    return null;
  }
  const fps = Number($('fps').value) || 25;
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.src = src.blobUrl;
  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = rej;
  });
  const N = 20;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const target = (v.duration * (i + 0.5)) / N;
    const t0 = performance.now();
    v.currentTime = target;
    await new Promise((res) => {
      v.onseeked = res;
    });
    const latencyMs = performance.now() - t0;
    const achieved = v.currentTime;
    rows.push({
      requested: +target.toFixed(4),
      achieved: +achieved.toFixed(4),
      deltaMs: +((achieved - target) * 1000).toFixed(2),
      deltaFrames: +((achieved - target) * fps).toFixed(2),
      latencyMs: +latencyMs.toFixed(1),
    });
  }
  const lat = rows.map((r) => r.latencyMs);
  const summary = {
    n: N,
    fps,
    maxAbsDeltaFrames: Math.max(...rows.map((r) => Math.abs(r.deltaFrames))),
    meanLatencyMs: +(lat.reduce((a, b) => a + b, 0) / N).toFixed(1),
    maxLatencyMs: Math.max(...lat),
    rows,
  };
  state.metrics.seek = summary;
  $('seek-out').textContent =
    `seek ×${N}: max |Δ| ${summary.maxAbsDeltaFrames} frames, ` +
    `latency mean ${summary.meanLatencyMs} ms / max ${summary.maxLatencyMs} ms`;
  renderTable('seek-table', rows);
  log('seek harness done');
  return summary;
}

// ---------------------------------------------------------------- drift harness (deliverable 6)

async function driftHarness(durationMs = 60_000) {
  const src = state.outputs.vp9 ?? state.outputs.vp8;
  if (!src) {
    log('convert something first');
    return null;
  }
  const v = $('player');
  v.src = src.blobUrl;
  v.muted = true;
  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = rej;
  });
  const t1 = Number($('loop-t1').value) || 0.2;
  const t2 = Math.min(Number($('loop-t2').value) || 1.4, v.duration - 0.02);
  const seg = t2 - t1;
  const CORRECT_ABOVE = 0.08; // s — corrective-seek threshold
  const GRACE_MS = 250; // ignore drift right after a wrap while the seek settles

  v.currentTime = t1;
  await new Promise((res) => (v.onseeked = res));
  await v.play();

  const start = performance.now();
  const drifts = [];
  const wraps = [];
  const corrections = [];
  let wrapPending = null; // { issuedAt, overshoot }
  let lastWrapDone = -Infinity;

  return await new Promise((resolve) => {
    v.onseeked = () => {
      if (wrapPending) {
        wraps.push({
          overshootMs: +(wrapPending.overshoot * 1000).toFixed(1),
          seekMs: +(performance.now() - wrapPending.issuedAt).toFixed(1),
        });
        wrapPending = null;
        lastWrapDone = performance.now();
      }
    };
    const tick = () => {
      const now = performance.now();
      if (now - start >= durationMs) {
        v.pause();
        const absd = drifts.map(Math.abs);
        const summary = {
          durationMs,
          segment: [t1, t2],
          samples: drifts.length,
          wraps: wraps.length,
          meanAbsDriftMs: +((absd.reduce((a, b) => a + b, 0) / (absd.length || 1)) * 1000).toFixed(
            1,
          ),
          maxAbsDriftMs: +(Math.max(0, ...absd) * 1000).toFixed(1),
          wrapSeekMsMean: +(wraps.reduce((a, w) => a + w.seekMs, 0) / (wraps.length || 1)).toFixed(
            1,
          ),
          wrapSeekMsMax: Math.max(0, ...wraps.map((w) => w.seekMs)),
          wrapOvershootMsMax: Math.max(0, ...wraps.map((w) => w.overshootMs)),
          corrections: corrections.length,
          correctionSizesMs: corrections.map((c) => c.sizeMs),
          thresholdMs: CORRECT_ABOVE * 1000,
        };
        state.metrics.drift = summary;
        $('drift-out').textContent =
          `drift 60s: ${summary.wraps} wraps, |drift| mean ${summary.meanAbsDriftMs} ms / max ${summary.maxAbsDriftMs} ms, ` +
          `wrap seek mean ${summary.wrapSeekMsMean} ms, corrections ${summary.corrections}`;
        log('drift harness done');
        resolve(summary);
        return;
      }
      // The future VideoDriver's model: an independent expected clock; the driver
      // COMMANDS the wrap (never <video loop>), and corrects above a threshold.
      const elapsed = (now - start) / 1000;
      const expected = t1 + (elapsed % seg);
      const cur = v.currentTime;
      if (!wrapPending && cur >= t2) {
        wrapPending = { issuedAt: now, overshoot: cur - t2 };
        v.currentTime = t1 + (cur - t2); // carry the overshoot through the wrap
      } else if (!wrapPending && now - lastWrapDone > GRACE_MS) {
        const drift = cur - expected;
        // near the wrap boundary expected and cur legitimately disagree by ~seg — skip
        if (Math.abs(drift) < seg / 2) {
          drifts.push(drift);
          if (Math.abs(drift) > CORRECT_ABOVE) {
            corrections.push({ at: +elapsed.toFixed(2), sizeMs: +(drift * 1000).toFixed(1) });
            v.currentTime = expected;
            lastWrapDone = now; // grace after a corrective seek too
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------------- hardware artifacts (deliverable 9)

function bytesToBase64(bytes) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(new Blob([bytes], { type: 'video/webm' }));
  });
}

// CEF-~71-safe on purpose: ES5 script, no post-ES2017 builtins, no replaceAll (B-066),
// zero external requests, transparent page background.
async function buildArtifact(codec) {
  const out = state.outputs[codec];
  if (!out) {
    log(`convert ${codec} first`);
    return null;
  }
  const b64 = await bytesToBase64(out.bytes);
  const html = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>D-128 spike — ' +
      codec.toUpperCase() +
      ' alpha test</title>',
    '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}',
    '#v{position:absolute;left:64px;top:64px;width:512px;height:512px}</style></head>',
    '<body><video id="v" autoplay muted loop playsinline src="data:video/webm;base64,' +
      b64 +
      '"></video>',
    '<script>var v=document.getElementById("v");function go(){var p=v.play();if(p&&p.catch){p.catch(function(){setTimeout(go,250)})}}go();</scr' +
      'ipt>',
    '</body></html>',
  ].join('\n');
  const name = codec + '-alpha-test.html';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = name;
  a.click();
  log(`artifact ${name} built (${fmtMB(html.length)})`);
  return html;
}

// ---------------------------------------------------------------- misc UI

function renderTable(id, rows) {
  const el = $(id);
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  el.innerHTML =
    '<tr>' +
    cols.map((c) => `<th>${c}</th>`).join('') +
    '</tr>' +
    rows.map((r) => '<tr>' + cols.map((c) => `<td>${r[c]}</td>`).join('') + '</tr>').join('');
}

function downloadMetrics() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(state.metrics, null, 2)], { type: 'application/json' }),
  );
  a.download = 'metrics.json';
  a.click();
}

async function loadFixture() {
  // Convenience only — on some machines a local AV/proxy layer swallows binary bodies
  // over localhost HTTP (a synthesized 204/empty). The picker/drag-drop path (an
  // OS-backed File) is the reliable one and is what test.mjs uses.
  const res = await fetch('fixtures/box-64x64-bgra.avi', { cache: 'no-store' });
  const blob = res.ok ? await res.blob() : null;
  if (!blob || blob.size === 0) {
    log(
      'fixture fetch blocked/empty (local AV?) — use the file picker on fixtures/box-64x64-bgra.avi instead',
    );
    return;
  }
  await mountInput(new File([blob], 'box-64x64-bgra.avi', { type: 'video/x-msvideo' }));
}

// expose for test.mjs
window.__spikeApi = {
  loadFixture,
  mountInput,
  convert,
  cancel,
  seekHarness,
  driftHarness,
  buildArtifact,
  sniffCodec,
};

// wire UI
$('pick').addEventListener('change', (e) => e.target.files[0] && mountInput(e.target.files[0]));
$('load-fixture').addEventListener('click', loadFixture);
$('convert-vp9').addEventListener('click', () => convert('vp9'));
$('convert-vp8').addEventListener('click', () => convert('vp8'));
$('cancel').addEventListener('click', cancel);
$('seek').addEventListener('click', seekHarness);
$('drift').addEventListener('click', () => driftHarness());
$('artifact-vp9').addEventListener('click', () => buildArtifact('vp9'));
$('artifact-vp8').addEventListener('click', () => buildArtifact('vp8'));
$('metrics').addEventListener('click', downloadMetrics);
const drop = document.body;
drop.addEventListener('dragover', (e) => e.preventDefault());
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) mountInput(f);
});
log('page booted — wasm NOT loaded (loads on first convert)');
