import { app, BrowserWindow, ipcMain } from 'electron';
import { boot, type BootHandle } from './boot.js';
import { createRuntimeWindow } from './windows/RuntimeWindow.js';

ipcMain.handle('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}));

let booted: BootHandle | null = null;

void app.whenReady().then(() => {
  const window = createRuntimeWindow();
  // Boot services once the window's webContents exists so we can push to it.
  booted = boot({ ipcMain, window });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createRuntimeWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Runtime is Windows-only; quit on last window close matches platform conventions.
  // In production (M9) the Runtime gains a watchdog so it can be re-launched
  // by the OS task scheduler if it ever exits unexpectedly during broadcast.
  app.quit();
});

app.on('before-quit', async (event) => {
  if (booted !== null) {
    event.preventDefault();
    const handle = booted;
    booted = null;
    await handle.shutdown();
    app.quit();
  }
});
