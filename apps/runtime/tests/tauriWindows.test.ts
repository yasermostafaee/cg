import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 `FIELD-FIXES-01` F — **EVERY WINDOW OF THE INSTALLED APP HAS TAURI'S NATIVE DRAG-AND-DROP
 * HANDLER OFF.** In Tauri 2 `dragDropEnabled` defaults to TRUE (`tauri-utils` 2.9.3, the locked
 * version: "Disabling it is required to use HTML5 drag and drop on the frontend on Windows"), and
 * on Windows the native handler then takes the drop, so the page's HTML5 `dragover`/`drop` never
 * fire. CG Control uses HTML5 drag and drop for a `.vcg` dropped into the template picker and for
 * reordering a list field in the Inspector; files from Explorer still arrive, as HTML5 `File`
 * drops, once the native handler is off.
 *
 * ⚠ A synthetic JavaScript drag cannot prove the fix: Tauri's handler takes only REAL OS drags.
 * This pins the configuration; the proof of the behaviour is the owner's hand on the installer.
 * No window is built at run time (the shell's Rust creates none), so the config is every window.
 */

interface WindowConfig {
  readonly label?: string;
  readonly title?: string;
  readonly dragDropEnabled?: boolean;
}

const conf = JSON.parse(
  fs.readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { productName: string; identifier: string; app: { windows: WindowConfig[] } };

/** The windows on which Tauri's native handler would take the drop (the key absent = ON). */
function nativeDragDropWindows(windows: readonly WindowConfig[]): string[] {
  return windows.filter((w) => w.dragDropEnabled !== false).map((w) => w.label ?? '(unlabelled)');
}

describe('CG Control — HTML5 drag and drop reaches the page', () => {
  it('🔴 every window declares `dragDropEnabled: false`', () => {
    expect(conf.app.windows.length, 'the config declares its windows').toBeGreaterThan(0);
    expect(nativeDragDropWindows(conf.app.windows)).toEqual([]);
  });

  it('CONTROL — the same check fails for a window without the key, because the default is ON', () => {
    const withoutKey = conf.app.windows.map(({ dragDropEnabled: _off, ...rest }) => rest);
    expect(nativeDragDropWindows(withoutKey)).toEqual(conf.app.windows.map((w) => w.label));
  });
});

/**
 * 🔴 `FIELD-FIXES-01` G — **THE NAME APPEARS ONCE, IN THE WINDOW'S TITLE BAR, AS `APASAI CG CONTROL`.**
 * The installed app's taskbar and installer name stay what they were: `productName`, the
 * `identifier` and every state or log folder are the owner's to rename, and renaming them moves
 * the user's settings.
 */
describe('CG Control — the title bar says APASAI CG CONTROL', () => {
  it('🔴 every window is titled APASAI CG CONTROL', () => {
    expect(conf.app.windows.map((w) => w.title)).toEqual(
      conf.app.windows.map(() => 'APASAI CG CONTROL'),
    );
  });

  it('CONTROL — the product name and identifier are unchanged', () => {
    expect(conf.productName).toBe('CG Control');
    expect(conf.identifier).toBe('app.cgbroadcast.control');
  });
});
