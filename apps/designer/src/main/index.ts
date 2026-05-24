import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, protocol, session } from 'electron';
import { bootDesigner, type DesignerBootHandle } from './boot.js';
import { CG_PREVIEW_SCHEME, registerPreviewProtocol } from './preview/register-protocol.js';
import { createEditorWindow } from './windows/EditorWindow.js';

ipcMain.handle('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}));

// cgpreview:// privileges must be registered BEFORE app.whenReady (Phase 4 §5).
protocol.registerSchemesAsPrivileged([CG_PREVIEW_SCHEME]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the bundled `@cg/template-runtime` payload. The bundle script
 * (`scripts/bundle-runtime.mjs`) writes it to
 * `apps/designer/resources/template-runtime/cg.js`. We resolve relative
 * to this file's compiled location at `out/main/index.js` so production
 * (electron-packaged) + dev (electron-vite) layouts both work.
 */
function loadBundledCgJs(): string {
  const candidates = [
    path.resolve(__dirname, '../../resources/template-runtime/cg.js'),
    path.resolve(__dirname, '../resources/template-runtime/cg.js'),
    path.resolve(process.cwd(), 'resources/template-runtime/cg.js'),
  ];
  for (const c of candidates) {
    try {
      return fs.readFileSync(c, 'utf-8');
    } catch {
      // try next
    }
  }
  // Fall back to a stub so the app still boots — the export pipeline
  // will produce an unrunnable .vcg, but the operator will see a
  // clear error in the Designer's preview pane instead of a crash.
  return 'export function createRuntime(){return{ready:Promise.resolve()};}export function installCasparGlobals(){}';
}

let booted: DesignerBootHandle | null = null;

void app.whenReady().then(() => {
  const window = createEditorWindow();
  booted = bootDesigner({ ipcMain, window, cgJs: loadBundledCgJs() });

  // Register the cgpreview:// scheme handler against the default session
  // so iframes inside the BrowserWindow resolve it.
  registerPreviewProtocol({ protocol: session.defaultSession.protocol, fs: booted.preview.fs });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createEditorWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit on all platforms when the last window closes — Designer is single-window.
  app.quit();
});

app.on('before-quit', (event) => {
  if (booted !== null) {
    event.preventDefault();
    const handle = booted;
    booted = null;
    handle.shutdown();
    app.quit();
  }
});
