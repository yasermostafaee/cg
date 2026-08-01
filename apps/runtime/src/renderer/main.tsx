import '@cg/ui/theme.css';
import './ui/controls.css';
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { createRuntimeBridge } from '../platform/createRuntimeBridge.js';
import { reportCommandError } from './features/status/commandFeedback.js';

/**
 * Browser entry point. The Electron preload used to inject `window.cg`
 * before the renderer ran; in the browser we build the same bridge
 * in-process and assign it before first render so every component sees a
 * ready bridge.
 *
 * `createRuntimeBridge()` is async (C-001): it probes the local CasparCG
 * bridge once (1500ms) and resolves to the live `WebSocketRuntime` if reachable,
 * else the offline `MockRuntime`. We await it before rendering so the chosen
 * backend is fixed and the connection indicator is correct on first paint.
 *
 * R-031 — this file REPORTS its boot steps to the startup splash and never depends on
 * it. The splash is not a React component and could not be one: it has to be on screen
 * during exactly this function — the bundle parse plus that 1500 ms probe — so it lives
 * in `index.html` and owns its own clock (`window.__CG_SPLASH__`, see that file). The
 * pre-render that used to sit here (`<div className="cg-booting">Connecting to bridge…`)
 * is gone: it was the product's unstyled first frame, and the splash is that state now.
 *
 * Every call is optional-chained, so a build with no splash element — or a test run with
 * `__CG_SPLASH_DISABLED__` set — boots identically. The phases below are the steps this
 * function ACTUALLY has; none was invented to lengthen the readout. `INITIALIZING` is
 * emitted by the inline script itself at first paint, before any of this runs.
 *
 * There are three labels and three work steps, and no terminal "READY": `done()` FADES THE
 * LABEL OUT instead of settling on a word. A fast cold boot finishes about a second in
 * while the hold keeps the door shut until 5 s, so a READY label would be on screen for
 * most of the splash at exactly the moment the operator still cannot use the app.
 */
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element in index.html');
}

const root = createRoot(rootEl);

/**
 * The FIRST REACT COMMIT — the second half of "boot is done", and the reason this
 * wrapper exists at all: `root.render()` is not synchronous with paint, so signalling
 * from after the call would claim readiness the operator cannot yet see. A mount effect
 * fires after the tree has committed, which is the honest moment.
 *
 * The first half is bridge selection having RESOLVED — `live`, `offline-mock` and
 * `disconnected` all count, since all three are answers. Snapshot pulls (stack / health /
 * lock) are deliberately not part of the gate: they have their own in-app loading states
 * and on a disconnected link they never settle, so waiting on them would pin the splash
 * to its ceiling on exactly the installs that most need to reach the UI.
 *
 * `done()` is idempotent by contract, which matters here: StrictMode re-runs mount
 * effects in development, so this fires twice as a matter of course.
 */
function BootComplete({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    window.__CG_SPLASH__?.done();
  }, []);
  return <>{children}</>;
}

async function boot(): Promise<void> {
  window.__CG_SPLASH__?.phase('PROBING BRIDGE');
  // Reconnect-reconciliation — a failed template re-delivery during the
  // post-reconnect resync surfaces on the operator's command-error toast.
  window.cg = await createRuntimeBridge({ onResyncError: reportCommandError });
  window.__CG_SPLASH__?.phase('STARTING INTERFACE');
  root.render(
    <StrictMode>
      <BootComplete>
        <App />
      </BootComplete>
    </StrictMode>,
  );
}

void boot();
