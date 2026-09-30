// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { authStub, fillBridgeStub, signedInStub } from './support/authStub.js';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A — **CG BRIDGE'S LOGS ARE DOWNLOADED, BY A STATION ADMIN.** They live on
 * the Playout machine now (`%ProgramData%\CG Bridge\logs\`), so `FIELD-FIXES-01` G's "Open log folder"
 * (CG Control's own sidecar, on this PC) became one zip saved from CG Bridge. The control is offered
 * to a station admin — or to anyone on a station with auth off — and is ABSENT for everyone else,
 * never a disabled button; the bridge refuses the ticket to anyone else in any case.
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

function stubBridge(
  auth: AuthSessionState,
  connected: boolean,
  downloads: { count: number },
): void {
  const stub = {
    audit: {
      canDownloadLogs: () => connected,
      downloadLogs: () => {
        downloads.count += 1;
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
    },
    templates: { list: () => Promise.resolve([]) },
    fixedLayers: { config: () => Promise.resolve(null) },
    auth: authStub(auth),
  };
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
  document.querySelector<HTMLButtonElement>('[data-audit-download-logs]');

const ADMIN = signedInStub('Mina', [1], ['station-admin', 'operator', 'viewer']);
const OPERATOR = signedInStub('Sara', [1]);

describe('CG Bridge’s logs, from the audit log', () => {
  it('🔴 a station admin is offered `Download logs`, and it downloads them from CG Bridge', async () => {
    const downloads = { count: 0 };
    stubBridge(ADMIN, true, downloads);
    await render();
    expect(button()?.textContent).toContain('Download logs');
    await act(async () => {
      button()?.click();
      await Promise.resolve();
    });
    expect(downloads.count).toBe(1);
  });

  it('an operator is not offered it — absent, not disabled', async () => {
    stubBridge(OPERATOR, true, { count: 0 });
    await render();
    expect(button()).toBeNull();
    // …and the panel itself rendered, so the absence is the control's, not the panel's.
    expect(document.body.textContent).toContain('Refresh');
  });

  it('a station with auth off offers it to its console', async () => {
    stubBridge({ kind: 'off' }, true, { count: 0 });
    await render();
    expect(button()).not.toBeNull();
  });

  it('CONTROL — with no CG Bridge (test mode) there is nothing to download, and no control', async () => {
    stubBridge(ADMIN, false, { count: 0 });
    await render();
    expect(button()).toBeNull();
  });
});
