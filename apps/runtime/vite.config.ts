import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

/**
 * Runtime browser SPA. The renderer lives under `src/renderer`; the
 * `src/platform` layer provides the in-process `window.cg` bridge (a mock
 * until the CasparCG WebSocket↔TCP bridge lands). Workspace packages
 * (`@cg/*`) resolve to their built `dist/` via the pnpm workspace.
 */

/**
 * R-031 — THE BUILD STAMP. One object, computed ONCE, feeding TWO consumers, because
 * what an operator reads off the startup splash and repeats down a phone line has to
 * identify the running build exactly — and two independently-derived stamps are two
 * stamps that can disagree about which build is on the box.
 *
 *  - `transformIndexHtml` puts it in the HTML. That is not a preference: the splash
 *    paints BEFORE the bundle, so a `define` global does not exist yet at the moment it
 *    renders, and an HTML transform is the only mechanism that reaches that frame.
 *  - `define: __CG_BUILD__` puts the SAME object in the bundle, so a later status bar or
 *    about surface reads these values instead of deriving a second set.
 */
interface BuildStamp {
  readonly version: string;
  readonly sha: string;
  readonly builtAt: string;
}

/** This config's own directory — the repo path to ask git about, and where `package.json` is. */
const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * The short commit SHA — and this function MUST NEVER FAIL THE BUILD.
 *
 * A source tree with no `.git` is normal, not an error: release tarballs and Docker
 * layers that copy sources without the repository both hit it, and a build that died
 * because it could not find a commit hash for a caption would be an absurd failure mode.
 * Every path out of git is therefore funnelled to one fallback:
 *
 *   - `git` not on PATH                 → `execFileSync` throws       → 'nogit'
 *   - no `.git` (tarball / Docker COPY) → git exits non-zero          → 'nogit'
 *   - git present but output empty      → the explicit length check   → 'nogit'
 *
 * stderr is routed to `ignore` so git's "not a git repository" complaint does not appear
 * in build logs looking like something went wrong.
 */
function shortShaOrFallback(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: here,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return sha.length > 0 ? sha : 'nogit';
  } catch {
    return 'nogit';
  }
}

const pkg = JSON.parse(readFileSync(`${here}package.json`, 'utf8')) as { version?: string };

const buildStamp: BuildStamp = {
  version: pkg.version ?? '0.0.0',
  sha: shortShaOrFallback(),
  builtAt: new Date().toISOString().slice(0, 10),
};

/**
 * What the splash's foot actually prints: `sha · YYYY-MM-DD`, and NO version.
 *
 * `0.0.0` is a placeholder, not a release identity — printing `v0.0.0` on the product's
 * first frame would be a false claim about a release this project does not yet cut. The
 * `version` field rides along in `__CG_BUILD__` regardless, so on the day releases are
 * tagged only the render site changes.
 */
const buildStampText = `${buildStamp.sha} · ${buildStamp.builtAt}`;

function buildStampPlugin(): Plugin {
  return {
    name: 'cg-runtime-build-stamp',
    transformIndexHtml: {
      /**
       * `'pre'`, and a COMMENT placeholder rather than `%TOKEN%`, for one reason: Vite
       * runs its own `%ENV%` replacement pass over `index.html`, a `%…%` token can
       * collide with it, and a transform landing after that pass would be looking for
       * something already rewritten.
       */
      order: 'pre',
      handler(html: string): string {
        return html.replace('<!-- CG_BUILD_STAMP -->', buildStampText);
      },
    },
  };
}

export default defineConfig({
  plugins: [vanillaExtractPlugin(), react(), buildStampPlugin()],
  define: {
    __CG_BUILD__: JSON.stringify(buildStamp),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    // Defaults to loopback. Set HOST=0.0.0.0 (or `true`) to expose the dev
    // server on the LAN — e.g. to open the Designer from another device.
    // Override the port with PORT (e.g. PORT=80 for a bare http://<ip>/ URL).
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 5174,
  },
  preview: {
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 7000,
  },
});
