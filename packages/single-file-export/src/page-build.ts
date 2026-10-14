import { sha256Hex } from '@cg/vcg-format';
import { cgCss, cgJsIife, cgJsLottieIife } from './cg-runtime.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **THE REVISION OF THE PAGE SHELL `ExporterSingleFile` WRAPS AROUND
 * THE RUNTIME.** The runtime bundles, the base CSS and the fonts are fingerprinted from their own
 * text; the shell (the boot script, the GDD block, the asset inlining) is code in this package and
 * cannot be. So it is a number, and `page-build.test.ts` pins the shell's output for a fixed scene
 * beside it: an edit that changes what the shell writes turns that test red, and the remedy it
 * names is to bump this.
 *
 * Bumping it makes every CG Control on the next release rebuild every page it can.
 */
export const EXPORTER_SHELL_REVISION = 1;

/**
 * 🔴 `PAGE-REBUILD-01` — **THE FINGERPRINT OF EVERYTHING A PAGE IS BUILT FROM BESIDE ITS OWN
 * PACKAGE**: the runtime IIFE, the Lottie player, the base CSS, the console's bundled font CSS and
 * the shell revision. Sixteen hex of their SHA-256. Two consoles answer the same value exactly when
 * they would build the same page from the same package — which is the one question a rebuild asks.
 *
 * ⚠ It hashes the font CSS TEXT, not the font files it names. A face replaced under the same file
 * name is not seen; ship a changed face under a new name (or bump {@link EXPORTER_SHELL_REVISION}).
 *
 * Synchronous and dependency-free on purpose: `@cg/vcg-format`'s SHA-256 runs in any page, a console
 * opened over plain HTTP on the LAN included, where `crypto.subtle` does not exist.
 */
export function pageRuntimeBuild(fontsCss: string): string {
  return sha256Hex(
    [`shell:${String(EXPORTER_SHELL_REVISION)}`, cgJsIife, cgJsLottieIife, cgCss, fontsCss].join(
      '\u0000',
    ),
  ).slice(0, 16);
}
