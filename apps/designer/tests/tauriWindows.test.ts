import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 `FIELD-FIXES-01` F — **EVERY WINDOW OF THE INSTALLED APP HAS TAURI'S NATIVE DRAG-AND-DROP
 * HANDLER OFF.** In Tauri 2 `dragDropEnabled` defaults to TRUE (`tauri-utils` 2.9.3, the locked
 * version: "Disabling it is required to use HTML5 drag and drop on the frontend on Windows"), and
 * on Windows the native handler then takes the drop, so the page's HTML5 `dragover`/`drop` never
 * fire. CG Designer drags an asset from the Assets panel onto the canvas with HTML5 drag and drop,
 * and takes files from Explorer the same way; those still arrive, as HTML5 `File` drops, once the
 * native handler is off.
 *
 * ⚠ A synthetic JavaScript drag cannot prove the fix: Tauri's handler takes only REAL OS drags.
 * This pins the configuration; the proof of the behaviour is the owner's hand on the installer.
 * No window is built at run time (the shell's Rust creates none), so the config is every window.
 */

interface WindowConfig {
  readonly label?: string;
  readonly dragDropEnabled?: boolean;
}

const conf = JSON.parse(
  fs.readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { app: { windows: WindowConfig[] } };

/** The windows on which Tauri's native handler would take the drop (the key absent = ON). */
function nativeDragDropWindows(windows: readonly WindowConfig[]): string[] {
  return windows.filter((w) => w.dragDropEnabled !== false).map((w) => w.label ?? '(unlabelled)');
}

describe('CG Designer — HTML5 drag and drop reaches the page', () => {
  it('🔴 every window declares `dragDropEnabled: false`', () => {
    expect(conf.app.windows.length, 'the config declares its windows').toBeGreaterThan(0);
    expect(nativeDragDropWindows(conf.app.windows)).toEqual([]);
  });

  it('CONTROL — the same check fails for a window without the key, because the default is ON', () => {
    const withoutKey = conf.app.windows.map(({ dragDropEnabled: _off, ...rest }) => rest);
    expect(nativeDragDropWindows(withoutKey)).toEqual(conf.app.windows.map((w) => w.label));
  });
});
