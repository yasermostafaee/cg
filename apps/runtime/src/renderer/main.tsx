import '@cg/ui/theme.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { createRuntimeBridge } from '../platform/createRuntimeBridge.js';

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
 */
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element in index.html');
}

const root = createRoot(rootEl);
root.render(<div className="cg-booting">Connecting to bridge…</div>);

async function boot(): Promise<void> {
  window.cg = await createRuntimeBridge();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
