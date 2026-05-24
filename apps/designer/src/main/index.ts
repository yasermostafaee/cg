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

let booted: DesignerBootHandle | null = null;

void app.whenReady().then(() => {
  const window = createEditorWindow();
  // Inject a stub cg.js for the preview-runtime payload. Production builds
  // ship a real pre-bundled `@cg/template-runtime` at resources/template-
  // runtime/cg.js; M6.6 wires the actual bundling step.
  const cgJs =
    'export function createRuntime(){return{ready:Promise.resolve()};}export function installCasparGlobals(){}';
  booted = bootDesigner({ ipcMain, window, cgJs });

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
