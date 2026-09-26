// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { authStub, fillBridgeStub } from './support/authStub.js';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `FIELD-FIXES-01` G — **THE LOG FOLDER'S DOOR MOVED FROM THE NATIVE MENU INTO THE CONSOLE.**
 * CG Control's menu bar was the second line repeating the app's name, and it went; its "Open bridge
 * log" is now the audit log's `Open log folder`, inside CG Control only (the shell's
 * `open_bridge_log`). A browser console has no such door, and the control is ABSENT there — not a
 * disabled button that could never work.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function stubBridge(door: boolean, opened: { count: number }): void {
  const stub = {
    audit: {
      canOpenLogFolder: () => door,
      openLogFolder: () => {
        opened.count += 1;
        return Promise.resolve({ accepted: true });
      },
      recent: () => Promise.resolve([]),
      health: () =>
        Promise.resolve({
          configured: true,
          path: '/cg/audit.ndjson',
          errorCount: 0,
          lastError: null,
        }),
      operatorName: () => '',
      setOperatorName: () => undefined,
    },
    templates: { list: () => Promise.resolve([]) },
    fixedLayers: { config: () => Promise.resolve(null) },
  };
  (stub as { auth?: unknown }).auth = authStub();
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
}

async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(AuditPanel, { open: true, onClose: () => undefined }),
      ),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const button = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('[data-audit-open-logs]');

describe('the log folder, from the audit log', () => {
  it('🔴 inside CG Control, `Open log folder` is offered and opens it through the shell', async () => {
    const opened = { count: 0 };
    stubBridge(true, opened);
    await render();
    expect(button()?.textContent).toContain('Open log folder');
    await act(async () => {
      button()?.click();
      await Promise.resolve();
    });
    expect(opened.count).toBe(1);
  });

  it('CONTROL — in a browser there is no door, so there is no control', async () => {
    stubBridge(false, { count: 0 });
    await render();
    expect(button()).toBeNull();
    // …and the panel itself rendered, so the absence is the door's, not the panel's.
    expect(document.body.textContent).toContain('Refresh');
  });
});
