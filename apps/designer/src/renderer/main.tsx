import '@cg/ui/theme.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { initDesignerPlatform } from '../platform/createDesignerBridge.js';

/**
 * Browser entry point. The Electron preload used to inject `window.cg`
 * before the renderer ran; in the browser we build the same bridge
 * in-process and assign it before first render so every component sees a
 * ready bridge.
 */
async function bootstrap(): Promise<void> {
  window.cg = await initDesignerPlatform();

  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Missing #root element in index.html');
  }

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
