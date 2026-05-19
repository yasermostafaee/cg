import { app, BrowserWindow, ipcMain } from 'electron';
import { createRuntimeWindow } from './windows/RuntimeWindow.js';

ipcMain.handle('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}));

void app.whenReady().then(() => {
  createRuntimeWindow();

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
