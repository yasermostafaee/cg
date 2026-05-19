import { app, BrowserWindow, ipcMain } from 'electron';
import { createEditorWindow } from './windows/EditorWindow.js';

ipcMain.handle('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}));

void app.whenReady().then(() => {
  createEditorWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createEditorWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit on all platforms when the last window closes — Designer is single-window.
  // (On macOS the conventional behavior is to stay running, but Designer is
  // Windows-only per the blueprint; matching Windows expectations.)
  app.quit();
});
