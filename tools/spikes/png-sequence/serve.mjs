// PNG-SEQUENCE-IMPORT-01 §0 spike — static server (node built-ins ONLY, the spikes convention).
//
// Serves this dir and maps the ffmpeg.wasm npm packages to same-origin /vendor/* URLs, exactly
// as `tools/spikes/video-convert/serve.mjs` does — the page never touches a CDN.
//
//   node tools/spikes/png-sequence/serve.mjs [port=8198]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPIKE_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = resolve(SPIKE_DIR, '..', '..', '..');
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
};

function pickFile(urlPath) {
  for (const [prefix, dir] of Object.entries(VENDOR)) {
    if (urlPath.startsWith(prefix)) return join(dir, urlPath.slice(prefix.length));
  }
  if (urlPath === '/') return join(SPIKE_DIR, 'index.html');
  return join(SPIKE_DIR, urlPath.slice(1));
}

export function serve(port) {
  return new Promise((done) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const abs = resolve(pickFile(urlPath));
        const roots = [SPIKE_DIR, ...Object.values(VENDOR)];
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
        res.writeHead(200, {
          'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
          'content-length': body.length,
          'cache-control': 'no-store',
        });
        res.end(body);
      } catch (err) {
        res.writeHead(err?.code === 'ENOENT' ? 404 : 500).end(String(err?.code ?? err));
      }
    });
    server.listen(port, '127.0.0.1', () => done(server));
  });
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const port = Number(process.argv[2] ?? 8198);
  await serve(port);
  console.log(`[png-sequence spike] http://127.0.0.1:${String(port)}/`);
}
