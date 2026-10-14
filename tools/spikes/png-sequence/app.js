// PNG-SEQUENCE-IMPORT-01 §0 spike — the page. Takes picked PNG frames, orders them by the number in
// their name, feeds them to the SAME ffmpeg.wasm core and the SAME VP8+alpha arguments the Designer
// uses (`apps/designer/src/renderer/features/assets/video-convert-args.ts` `VP8_ALPHA_ARGS`), and
// reports time, frames and the JS heap. The driver (`measure.mjs`) samples the process memory.
import { FFmpeg } from '/vendor/ffmpeg/index.js';

const $ = (id) => document.getElementById(id);
const log = (m) => {
  $('log').textContent += `${m}\n`;
};

/** Natural order by the digit runs in the name (`f2` before `f10`). */
function naturalCompare(a, b) {
  const ax = a.match(/\d+|\D+/g) ?? [];
  const bx = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (x !== y) return x < y ? -1 : 1;
  }
  return ax.length - bx.length;
}

const VP8_ALPHA_ARGS = [
  '-c:v',
  'libvpx',
  '-pix_fmt',
  'yuva420p',
  '-auto-alt-ref',
  '0',
  '-crf',
  '4',
  '-qmax',
  '16',
  '-b:v',
  '20M',
  '-g',
  '25',
  '-keyint_min',
  '25',
  '-deadline',
  'good',
  '-cpu-used',
  '5',
  '-an',
];

async function run() {
  const files = [...$('frames').files].sort((a, b) => naturalCompare(a.name, b.name));
  const fps = String(Number($('fps').value) || 50);
  const copy = $('copy').checked;
  const result = { ok: false, frames: files.length, fps, copy };
  let peakHeap = 0;
  const sampler = setInterval(() => {
    const used = performance.memory?.usedJSHeapSize ?? 0;
    if (used > peakHeap) peakHeap = used;
  }, 100);
  try {
    const ff = new FFmpeg();
    let lastFrame = 0;
    const tail = [];
    ff.on('log', ({ message }) => {
      tail.push(message);
      if (tail.length > 60) tail.shift();
      const m = /frame=\s*(\d+)/.exec(message);
      if (m) lastFrame = Number(m[1]);
    });
    const tLoad = performance.now();
    await ff.load({
      coreURL: new URL('/vendor/core/ffmpeg-core.js', location.href).href,
      wasmURL: new URL('/vendor/core/ffmpeg-core.wasm', location.href).href,
    });
    result.loadMs = Math.round(performance.now() - tLoad);
    // The frames' own extension (png / tga / webp / jpg) — which formats come for free is measured.
    const ext = (files[0]?.name.split('.').pop() ?? 'png').toLowerCase();
    result.ext = ext;
    const names = files.map((_, i) => `${String(i + 1).padStart(6, '0')}.${ext}`);
    const tIn = performance.now();
    if (copy) {
      // The comparison: every frame COPIED into wasm memory (MEMFS) before the encode.
      for (let i = 0; i < files.length; i++) {
        await ff.writeFile(names[i], new Uint8Array(await files[i].arrayBuffer()));
      }
    } else {
      // The proposal: WORKERFS `blobs`, renamed to a contiguous 000001.png… in natural order —
      // read lazily by the worker, never copied wholesale into JS or wasm memory.
      await ff.createDir('/mnt');
      await ff.mount(
        'WORKERFS',
        { blobs: files.map((f, i) => ({ name: names[i], data: f })) },
        '/mnt',
      );
    }
    result.inputMs = Math.round(performance.now() - tIn);
    const input = copy ? `%06d.${ext}` : `/mnt/%06d.${ext}`;
    const t0 = performance.now();
    const code = await ff.exec([
      '-y',
      '-framerate',
      fps,
      '-start_number',
      '1',
      '-i',
      input,
      ...VP8_ALPHA_ARGS,
      '-r',
      fps,
      '/out.webm',
    ]);
    result.convertMs = Math.round(performance.now() - t0);
    result.exitCode = code;
    result.encodedFrames = lastFrame;
    // The driver attributes memory samples taken before this flag to the CONVERSION; what follows
    // (reading the WebM out and handing it over as base64) is the spike's own cost, not the import's.
    window.__phase = 'converted';
    const out = await ff.readFile('/out.webm');
    result.outBytes = out.byteLength;
    result.ok = code === 0;
    result.tail = tail.slice(-25);
    // Hand the WebM to the driver (base64) for the on-air check.
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < out.length; i += chunk)
      bin += String.fromCharCode(...out.subarray(i, i + chunk));
    window.__webm = btoa(bin);
    ff.terminate();
  } catch (err) {
    result.error = String(err);
  } finally {
    clearInterval(sampler);
    result.peakJsHeapMB = Math.round((peakHeap / 1048576) * 10) / 10;
    window.__result = result;
    log(JSON.stringify({ ...result, tail: undefined }));
  }
}

$('run').addEventListener('click', () => void run());
