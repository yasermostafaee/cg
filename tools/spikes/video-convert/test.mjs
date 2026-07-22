// Automated end-to-end driver for the spike (also the documented `spike:*`-style script —
// deliberately NOT wired into turbo/the gate: the spikes dir is outside the build by
// convention, and the wasm conversion cannot RELIABLY fit the B-078 Playwright budgets).
//
//   node tools/spikes/video-convert/test.mjs                 # tiny committed fixture: convert
//                                                            # vp9+vp8, assert codecs, run seek +
//                                                            # drift harnesses, save artifacts +
//                                                            # results/metrics-fixture.json
//   node tools/spikes/video-convert/test.mjs --big <path>    # big-file run: WORKERFS bounded-memory
//                                                            # measurement, vp8 by default
//   node tools/spikes/video-convert/test.mjs --big <path> --codec vp9
//   node tools/spikes/video-convert/test.mjs --drift-ms 60000
//
// Uses the repo's Playwright (resolved through apps/designer) with the documented
// system-Chrome fallback (the Playwright CDN is geo-blocked locally — see repo memory).

import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(dir, '..', '..', '..');
const req = createRequire(join(repoRoot, 'apps', 'designer', 'package.json'));
const { chromium } = req('@playwright/test');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : (argv[i + 1] ?? true);
};
const bigPath = flag('--big');
const codecArg = flag('--codec');
const driftMs = Number(flag('--drift-ms') ?? 60_000);
const PORT = 8199;

function startServer() {
  const child = spawn(process.execPath, [join(dir, 'serve.mjs'), String(PORT)], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((res, rej) => {
    child.stdout.on('data', (d) => {
      if (String(d).includes('http://127.0.0.1')) res(child);
    });
    child.on('exit', (c) => rej(new Error(`server exited ${c}`)));
  });
}

async function launch() {
  try {
    return await chromium.launch(); // bundled, when present
  } catch {
    return await chromium.launch({ channel: 'chrome' }); // geo-block fallback (repo memory)
  }
}

const server = await startServer();
const browser = await launch();
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[spike]')) console.log(' ', t);
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);

  // decision (e) — the page must boot WITHOUT the wasm
  const preloaded = await page.evaluate(() => window.__spike.ffmpeg !== null);
  if (preloaded) throw new Error('wasm was loaded at boot — decision (e) violated');
  console.log('✓ boot without wasm (lazy)');

  if (bigPath) {
    // BIG-FILE RUN — setInputFiles hands the browser a real path; the renderer gets a
    // lazily-backed File, WORKERFS reads it via FileReaderSync — no wholesale copy.
    await page.setInputFiles('#pick', resolve(bigPath));
    await page.waitForFunction(() => window.__spike.mounted, null, { timeout: 120_000 });
    const codecs = codecArg ? [codecArg] : ['vp8'];
    for (const codec of codecs) {
      console.log(`converting BIG file as ${codec} — this is single-threaded wasm; be patient…`);
      const rec = await page.evaluate((c) => window.__spikeApi.convert(c), codec);
      if (!rec) throw new Error(`${codec} conversion failed`);
      console.log(
        `✓ big ${codec}: ${(rec.ms / 1000).toFixed(1)}s, out ${rec.outputSizeMB}, peak heap ${rec.peakJsHeapMB}`,
      );
    }
    const metrics = await page.evaluate(() => window.__spike.metrics);
    mkdirSync(join(dir, 'results'), { recursive: true });
    const out = join(dir, 'results', 'metrics-bigfile.json');
    writeFileSync(out, JSON.stringify(metrics, null, 2));
    console.log(`✓ wrote ${out}`);
  } else {
    // FIXTURE RUN — full pass. The fixture goes in through the FILE INPUT (an OS-backed
    // lazy File), not fetch(): a local AV/proxy layer on this machine swallows binary
    // bodies over localhost HTTP (fetch gets a synthesized 204) — see README caveat.
    const fixture = join(dir, 'fixtures', 'box-64x64-bgra.avi');
    await page.setInputFiles('#pick', fixture);
    await page.waitForFunction(() => window.__spike.mounted, null, { timeout: 60_000 });
    console.log('✓ fixture mounted (WORKERFS)');

    // 1 · VP8+alpha through the REAL in-browser pipeline (the codec that works — see README).
    const vp8 = await page.evaluate(() => window.__spikeApi.convert('vp8'));
    if (!vp8) throw new Error('vp8 conversion failed');
    const sniffed = await page.evaluate(() =>
      window.__spikeApi.sniffCodec(window.__spike.outputs.vp8.bytes),
    );
    if (sniffed !== 'V_VP8') throw new Error(`vp8: expected V_VP8, sniffed ${sniffed}`);
    if (vp8.outputSize <= 0) throw new Error('vp8: empty output');
    console.log(
      `✓ vp8 in-browser: non-empty WebM, CodecID ${sniffed}, ${(vp8.ms / 1000).toFixed(1)}s, ${vp8.outputSizeMB}`,
    );

    // 2 · Harnesses on the in-browser output (recorded against VP8 — noted in metrics).
    const seek = await page.evaluate(() => window.__spikeApi.seekHarness());
    console.log(
      `✓ seek: max|Δ| ${seek.maxAbsDeltaFrames} frames, latency mean ${seek.meanLatencyMs} ms / max ${seek.maxLatencyMs} ms`,
    );
    const drift = await page.evaluate((ms) => window.__spikeApi.driftHarness(ms), driftMs);
    console.log(
      `✓ drift ${driftMs / 1000}s: ${drift.wraps} wraps, |drift| mean ${drift.meanAbsDriftMs} ms / max ${drift.maxAbsDriftMs} ms, ` +
        `wrap seek mean ${drift.wrapSeekMsMean} ms / max ${drift.wrapSeekMsMax} ms, corrections ${drift.corrections}`,
    );

    // 3 · Grab the VP8 bytes for the artifact, THEN demonstrate the known VP9 crash
    //     (it kills the wasm worker, so it goes last).
    const vp8b64 = await page.evaluate(async () => {
      const r = new FileReader();
      const done = new Promise((res) => (r.onload = res));
      r.readAsDataURL(new Blob([window.__spike.outputs.vp8.bytes]));
      await done;
      return String(r.result).split(',')[1];
    });
    const vp9Attempt = await page.evaluate(() => window.__spikeApi.convert('vp9'));
    if (vp9Attempt) {
      console.log(
        '! vp9 in-browser UNEXPECTEDLY SUCCEEDED — the core bug may be fixed; update the README',
      );
    } else {
      console.log(
        '✓ vp9 in-browser fails as documented (known @ffmpeg/core 0.12.10 VP9-encode bug)',
      );
    }

    // 4 · VP9+alpha bytes via SYSTEM ffmpeg — playback-on-CEF is independent of
    //     in-browser encodability; provenance is stamped into the artifact.
    const vp9File = join(dir, 'results', 'fixture-vp9-system.webm');
    mkdirSync(join(dir, 'results'), { recursive: true });
    const enc = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        fixture,
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
        vp9File,
      ],
      { encoding: 'utf8' },
    );
    if (enc.status !== 0)
      throw new Error('system-ffmpeg vp9 encode failed:\n' + enc.stderr.slice(-800));
    const vp9Bytes = readFileSync(vp9File);
    console.log(`✓ vp9 via system ffmpeg: ${(vp9Bytes.length / 1024).toFixed(1)} KB`);

    // 5 · Hardware artifacts (CEF-~71-safe: ES5 script, no post-ES2017 builtins, no
    //     external requests, transparent background).
    mkdirSync(join(dir, 'artifacts'), { recursive: true });
    const artifact = (codec, b64, provenance) =>
      [
        '<!doctype html>',
        '<html><head><meta charset="utf-8"><title>D-128 spike — ' +
          codec +
          ' alpha test (' +
          provenance +
          ')</title>',
        '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}',
        '#v{position:absolute;left:64px;top:64px;width:512px;height:512px}</style></head>',
        '<body><video id="v" autoplay muted loop playsinline src="data:video/webm;base64,' +
          b64 +
          '"></video>',
        '<script>var v=document.getElementById("v");function go(){var p=v.play();if(p&&p.catch){p.catch(function(){setTimeout(go,250)})}}go();</scr' +
          'ipt>',
        '</body></html>',
      ].join('\n');
    writeFileSync(
      join(dir, 'artifacts', 'vp8-alpha-test.html'),
      artifact('VP8', vp8b64, 'in-browser ffmpeg.wasm pipeline'),
    );
    writeFileSync(
      join(dir, 'artifacts', 'vp9-alpha-test.html'),
      artifact(
        'VP9',
        vp9Bytes.toString('base64'),
        'system ffmpeg — in-browser VP9 encode is broken, see README',
      ),
    );
    console.log('✓ wrote artifacts/vp8-alpha-test.html + artifacts/vp9-alpha-test.html');

    // 6 · Metrics.
    const metrics = await page.evaluate(() => window.__spike.metrics);
    metrics.vp9SystemEncode = {
      provenance:
        'system ffmpeg (in-browser libvpx-vp9 encode crashes @ffmpeg/core 0.12.10 — see README)',
      outputSize: vp9Bytes.length,
    };
    metrics.harnessCodec = 'vp8 (in-browser output)';
    const out = join(dir, 'results', 'metrics-fixture.json');
    writeFileSync(out, JSON.stringify(metrics, null, 2));
    console.log(`✓ wrote ${out}`);
  }
  console.log('ALL PASSED');
} finally {
  await browser.close();
  server.kill();
}
