import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { createBuildStamp } from '@cg/splash-kit/build-stamp';

/**
 * Runtime browser SPA. The renderer lives under `src/renderer`; the
 * `src/platform` layer provides the in-process `window.cg` bridge (a mock
 * until the CasparCG WebSocket<->TCP bridge lands). Workspace packages
 * (`@cg/*`) resolve to their built `dist/` via the pnpm workspace.
 */

/**
 * R-035 - THE BUILD STAMP, from `@cg/splash-kit`: ONE object, computed ONCE, feeding
 * BOTH the HTML transform and the `__CG_BUILD__` define. It is SHARED with the Designer
 * rather than copied into it, because what an operator reads off a splash and repeats
 * down a phone line has to identify the running build exactly - and two independently
 * derived stamps are two stamps that can disagree about which build is on the box.
 *
 * The HTML transform is not a preference: the splash paints BEFORE the bundle, so a
 * `define` global does not exist yet at the moment it renders.
 */
const { plugin: buildStampPlugin, stamp: buildStamp } = createBuildStamp(
  fileURLToPath(new URL('.', import.meta.url)),
);

/**
 * `DEV-STATION-01` — the two routes only the BRIDGE's console listener answers, relayed when
 * `pnpm dev:station` serves the console here in its place: `/pgm/<n>` (the PROGRAM monitor's
 * picture, `C-016`) and `/__cg/health` (the identity the installed CG Control reads before it
 * starts, so it refuses by name while the dev station runs). Absent unless the launcher names the
 * listener in `CG_BRIDGE_CONSOLE` — and the launcher binds this server to 127.0.0.1, so the relay
 * reaches no browser on another machine.
 */
const bridgeConsole = process.env.CG_BRIDGE_CONSOLE;
const bridgeConsoleProxy =
  bridgeConsole !== undefined && bridgeConsole !== ''
    ? { proxy: { '/pgm/': bridgeConsole, '/__cg/': bridgeConsole } }
    : {};

/**
 * 🔴 `FIELD-FIXES-01` H — **`localhost` IS A TRAP ON THE DEV STATION.** The console has ONE origin,
 * `http://127.0.0.1:5174`: the entry a Playout's CORS list holds, and the only one the real Playout
 * admits. A page opened at `localhost:5174` is another origin, and its sign-in is refused. So when
 * the dev station names its host in `CG_CONSOLE_HOST`, a request asked for under `localhost` is sent
 * to that host on the same port, path and query kept — a 307, so nothing becomes a GET. Absent the
 * variable (a plain `dev`, a LAN browser) nothing changes.
 */
export function consoleHostRedirect(
  hostHeader: string | undefined,
  url: string | undefined,
  consoleHost: string,
): string | null {
  const match = /^localhost(:\d+)?$/i.exec(hostHeader ?? '');
  if (match === null) return null;
  return `http://${consoleHost}${match[1] ?? ''}${url ?? '/'}`;
}

const consoleHost = process.env.CG_CONSOLE_HOST;
const consoleHostPlugins: Plugin[] =
  consoleHost !== undefined && consoleHost !== ''
    ? [
        {
          name: 'cg-console-host',
          configureServer(server) {
            // Registered here, ahead of Vite's own middlewares: the page, its modules and the
            // relayed routes are all sent to the one origin.
            server.middlewares.use((req, res, next) => {
              const to = consoleHostRedirect(req.headers.host, req.url, consoleHost);
              if (to === null) {
                next();
                return;
              }
              res.statusCode = 307;
              res.setHeader('location', to);
              res.end();
            });
          },
        },
      ]
    : [];

export default defineConfig({
  plugins: [vanillaExtractPlugin(), react(), buildStampPlugin, ...consoleHostPlugins],
  define: {
    __CG_BUILD__: JSON.stringify(buildStamp),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    // P-041 — the DEV server is LAN-visible BY DEFAULT (`true` = every interface, and Vite
    // prints each Network URL). This is a private plant network, and the alternative is a
    // flag someone has to remember (`HOST=0.0.0.0` was that flag) — the failure mode this
    // repo has already paid for. `HOST=127.0.0.1` restricts it back to loopback.
    //
    // The dev-only boundary is Vite's own contract, not a convention: `server.*` is read by
    // the `vite` dev server ONLY. `vite build` binds nothing, and `vite preview` reads
    // `preview.*` below, which stays loopback — so a packaged build cannot inherit this.
    // `tests/vite-config.test.ts` pins both halves.
    //
    // HMR: `server.hmr.host` is deliberately UNSET, so Vite's client falls back to
    // `location.hostname` and a remote browser's HMR socket targets the address it loaded
    // the page from (verified over the LAN address, not assumed — see P-041).
    // Override the port with PORT (e.g. PORT=80 for a bare http://<ip>/ URL).
    host: process.env.HOST ?? true,
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 5174,
    ...bridgeConsoleProxy,
  },
  preview: {
    // Loopback by default, unchanged by P-041: `preview` serves the BUILT app, which is the
    // packaged-build path and out of that item's scope. HOST=0.0.0.0 exposes it explicitly.
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 7000,
  },
});
