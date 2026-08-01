import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * THE BUILD STAMP. One object, computed ONCE, feeding TWO consumers — because what an
 * operator reads off a startup splash and repeats down a phone line has to identify the
 * running build exactly, and two independently-derived stamps are two stamps that can
 * disagree about which build is on the box. Shared by both apps for the same reason it is
 * computed once within one app.
 *
 *  - `transformIndexHtml` puts it in the HTML. That is not a preference: the splash paints
 *    BEFORE the bundle, so a `define` global does not exist yet at the moment it renders,
 *    and an HTML transform is the only mechanism that reaches that frame.
 *  - `define: __CG_BUILD__` puts the SAME object in the bundle, so a later status bar or
 *    about surface reads these values instead of deriving a second set.
 *
 * WHY THIS FILE IS `.mjs` AND NOT `.ts`, which is worth knowing before someone "tidies" it:
 * its only consumer is each app's `vite.config.ts`. Vite loads a config by bundling it with
 * esbuild, but it treats a workspace package resolved through `node_modules` as EXTERNAL —
 * so Node imports this file directly, without a TypeScript transform, and a `.ts` source
 * export fails with `ERR_MODULE_NOT_FOUND` before the build starts. (Observed; the timing
 * half of this package is `.ts` and works, because its consumers are app code and tests,
 * which vite and vitest do transform.) Types live in `buildStamp.d.ts` beside it.
 */

/**
 * The short commit SHA — and this function MUST NEVER FAIL THE BUILD.
 *
 * A source tree with no `.git` is normal, not an error: release tarballs and Docker layers
 * that copy sources without the repository both hit it, and a build that died because it
 * could not find a commit hash for a caption would be an absurd failure mode. Every path out
 * of git is therefore funnelled to one fallback:
 *
 *   - `git` not on PATH                 → `execFileSync` throws       → 'nogit'
 *   - no `.git` (tarball / Docker COPY) → git exits non-zero          → 'nogit'
 *   - git present but output empty      → the explicit length check   → 'nogit'
 *
 * stderr is routed to `ignore` so git's "not a git repository" complaint does not appear in
 * build logs looking like something went wrong.
 *
 * @param {string} cwd
 * @returns {string}
 */
function shortShaOrFallback(cwd) {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return sha.length > 0 ? sha : 'nogit';
  } catch {
    return 'nogit';
  }
}

/**
 * Read `version` out of an app's `package.json`, without failing the build for it.
 *
 * @param {string} appDir
 * @returns {string}
 */
function versionOf(appDir) {
  try {
    const pkg = JSON.parse(readFileSync(`${appDir}package.json`, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Build the stamp for one app and the vite plugin that injects it.
 *
 * @param {string} appDir the app's own directory, with a trailing separator — normally
 *   `fileURLToPath(new URL('.', import.meta.url))` from that app's `vite.config.ts`. It is
 *   both the repo path to ask git about and where `package.json` is.
 */
export function createBuildStamp(appDir) {
  const stamp = {
    version: versionOf(appDir),
    sha: shortShaOrFallback(appDir),
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
  const stampText = `${stamp.sha} · ${stamp.builtAt}`;

  const plugin = {
    name: 'cg-build-stamp',
    transformIndexHtml: {
      /**
       * `'pre'`, and a COMMENT placeholder rather than `%TOKEN%`, for one reason: Vite runs
       * its own `%ENV%` replacement pass over `index.html`, a `%…%` token can collide with
       * it, and a transform landing after that pass would be looking for something already
       * rewritten.
       */
      order: 'pre',
      /**
       * @param {string} html
       * @returns {string}
       */
      handler(html) {
        return html.replace('<!-- CG_BUILD_STAMP -->', stampText);
      },
    },
  };

  return { plugin, stamp, stampText };
}
