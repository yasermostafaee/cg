import '@cg/ui/theme.css';
import './fonts.css';
import './index.css';
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { initDesignerPlatform } from '../platform/createDesignerBridge.js';
import './splashTiming.js';

/**
 * Browser entry point. The Electron preload used to inject `window.cg`
 * before the renderer ran; in the browser we build the same bridge
 * in-process and assign it before first render so every component sees a
 * ready bridge.
 *
 * THIS FILE REPORTS ITS BOOT STEPS TO THE STARTUP SPLASH and never depends on it. The
 * splash is not a React component and could not be one: it has to be on screen during
 * exactly this function — the bundle parse plus `initDesignerPlatform()` — so it lives in
 * `index.html` and owns its own clock (`window.__CG_SPLASH__`, see that file).
 *
 * Every call is optional-chained, so a build with no splash element — or a test run with
 * `__CG_SPLASH_DISABLED__` set — boots identically. The phases are the steps this function
 * ACTUALLY has; none was invented to lengthen the readout. `INITIALIZING` is emitted by the
 * inline script itself at first paint, before any of this runs.
 *
 * There is no terminal "READY": `done()` FADES THE LABEL OUT instead of settling on a word.
 * A fast cold boot finishes about a second in while the hold keeps the door shut until the
 * floor, so a READY label would be on screen for most of the splash at exactly the moment
 * the operator still cannot use the app.
 *
 * The `splashTiming.js` import is what puts this file's `declare global` in scope; it has no
 * runtime effect beyond that.
 */

/**
 * The FIRST REACT COMMIT — the second half of "boot is done", and the reason this wrapper
 * exists at all: `root.render()` is not synchronous with paint, so signalling from after the
 * call would claim readiness the operator cannot yet see. A mount effect fires after the tree
 * has committed, which is the honest moment.
 *
 * The first half is the platform/storage layer having RESOLVED. Project and asset loads are
 * deliberately not part of the gate: they have their own in-app loading states and belong to
 * the landing screen, which mounts after this — waiting on them risks a splash that never
 * lifts.
 *
 * `done()` is idempotent by contract, which matters here: StrictMode re-runs mount effects in
 * development, so this fires twice as a matter of course.
 */
function BootComplete({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    window.__CG_SPLASH__?.done();
  }, []);
  return <>{children}</>;
}

async function bootstrap(): Promise<void> {
  window.__CG_SPLASH__?.phase('OPENING STORAGE');
  window.cg = await initDesignerPlatform();

  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Missing #root element in index.html');
  }

  window.__CG_SPLASH__?.phase('STARTING INTERFACE');
  createRoot(rootEl).render(
    <StrictMode>
      <BootComplete>
        <App />
      </BootComplete>
    </StrictMode>,
  );
}

void bootstrap();
