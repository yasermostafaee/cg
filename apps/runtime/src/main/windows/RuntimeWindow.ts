import { BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Creates the Runtime's playout window. Strict security flags per Phase 2 §7:
 * sandbox, context isolation, no node integration, web security on.
 *
 * The renderer URL comes from electron-vite during `dev`; in production the
 * built HTML is loaded from disk.
 */
export function createRuntimeWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    backgroundColor: '#0F172A',
    title: 'cg Runtime',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, '../preload/runtime.preload.cjs'),
    },
  });

  win.once('ready-to-show', () => win.show());

  // External links open in the user's browser, never in-window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
