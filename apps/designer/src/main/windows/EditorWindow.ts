import { BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Creates the Designer's editor window. Strict security flags per Phase 2 §7:
 * sandbox, context isolation, no node integration, web security on.
 *
 * The renderer URL comes from electron-vite during `dev`; in production the
 * built HTML is loaded from disk.
 */
export function createEditorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#0F172A',
    title: 'cg Designer',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, '../preload/designer.preload.cjs'),
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    // In dev (`pnpm dev` sets ELECTRON_RENDERER_URL), open DevTools
    // automatically so the operator can inspect the cgpreview iframe
    // without remembering the F12 chord.
    if (process.env['ELECTRON_RENDERER_URL']) {
      win.webContents.openDevTools({ mode: 'right' });
    }
  });

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
