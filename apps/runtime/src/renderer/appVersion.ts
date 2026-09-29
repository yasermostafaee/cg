/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — **THIS BUILD'S RELEASE VERSION**, for the one line in CG Control
 * that names it (Station setup's rail).
 *
 * It is the build stamp's `version` — `@cg/splash-kit`'s `createBuildStamp`, fed in as `__CG_BUILD__`
 * by `vite.config.ts` (and by `vitest.config.ts` for the dom specs) — which reads this app's own
 * `package.json`. The installer reads the same number from `src-tauri/tauri.conf.json`, and
 * `tools/release` refuses a build whose files disagree, so the line, the installer and Windows'
 * Installed apps cannot name different releases.
 */
export const APP_VERSION: string = __CG_BUILD__.version;

/** The exact build behind the version, for the line's `title`: `0.9.0 · 5f3c2a1 · 2026-09-29`. */
export const APP_BUILD = `${__CG_BUILD__.version} · ${__CG_BUILD__.sha} · ${__CG_BUILD__.builtAt}`;
