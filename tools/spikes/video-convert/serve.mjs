// D-128 Phase 1 spike — static dev server (node built-ins ONLY, per the spikes convention).
//
// Serves this spike dir at http://127.0.0.1:<port>/ and maps the ffmpeg.wasm npm packages
// (installed as ROOT devDependencies — decision (a): npm delivery, no binary in git) to
// same-origin /vendor/* URLs. The page therefore never touches a CDN: the wrapper, util,
// and the single-threaded core JS+wasm are all served from node_modules on THIS origin.
//
//   node tools/spikes/video-convert/serve.mjs [port=8199]
//
// No COOP/COEP headers are set — the single-threaded core needs no SharedArrayBuffer (C4).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPIKE_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
// serve.mjs lives at tools/spikes/video-convert → repo root is three levels up.
const REPO_ROOT = resolve(SPIKE_DIR, '..', '..', '..');

/** Same-origin vendor routes → npm package dist dirs (decision (a)). */
const VENDOR = {
  '/vendor/ffmpeg/': join(REPO_ROOT, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm'),
  '/vendor/util/': join(REPO_ROOT, 'node_modules', '@ffmpeg', 'util', 'dist', 'esm'),
  '/vendor/core/': join(REPO_ROOT, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.css': 'text/css; charset=utf-8',
};

function pickFile(urlPath) {
  for (const [prefix, dir] of Object.entries(VENDOR)) {
    if (urlPath.startsWith(prefix)) return join(dir, urlPath.slice(prefix.length));
  }
  if (urlPath === '/') return join(SPIKE_DIR, 'index.html');
  return join(SPIKE_DIR, urlPath.slice(1));
}

const port = Number(process.argv[2] ?? 8199);

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = pickFile(urlPath);
    // Containment: only the spike dir and the three vendor dirs are servable.
    const roots = [SPIKE_DIR, ...Object.values(VENDOR)];
    const abs = resolve(file);
    if (!roots.some((r) => abs === r || abs.startsWith(r + sep))) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const st = await stat(abs);
    if (!st.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(abs);
    console.log(`  ${req.method} ${urlPath} → ${body.length} bytes`);
    res.writeHead(200, {
      'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(err?.code === 'ENOENT' ? 404 : 500).end(String(err?.code ?? err));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`[video-convert spike] http://127.0.0.1:${port}/`);
  console.log(`  spike dir : ${SPIKE_DIR}`);
  console.log(`  vendor    : @ffmpeg/{ffmpeg,util,core} from ${join(REPO_ROOT, 'node_modules')}`);
});
