// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * ⭐ **B-141 §5c — THE EMPTY STATE THAT NO LONGER ASSERTS A FACT IT CANNOT KNOW.**
 *
 * _"No audit entries yet."_ used to answer every empty read, and it cannot tell
 * apart:
 *
 *   - **nothing happened** — a configured, healthy writer with an empty record;
 *   - **nothing is recorded** — a writer failing every append;
 *   - **there is no writer** — a bridge booted without `--audit-log-path`.
 *
 * Two of those mean the operator's record is MISSING, and both were being reported
 * as the one that means the station was quiet. That is this repo's own recurring
 * error — a negative observation is not a result until a positive control proves
 * the instrument is live — shipped inside the product, where an operator acts on
 * it.
 *
 * So these tests are written the way that rule demands: the reassuring sentence is
 * the NARROWEST branch, and each of the other readings is pinned to say something
 * different. A suite that only checked the happy state would go green over exactly
 * the defect.
 */

interface Health {
  configured: boolean;
  path: string | null;
  errorCount: number;
  lastError: string | null;
}

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

const HEALTHY: Health = {
  configured: true,
  path: '/var/cg/audit.ndjson',
  errorCount: 0,
  lastError: null,
};

function stubBridge(health: Health, entries: AuditEntry[] = []): void {
  /*
    B-141 follow-up — the per-console operator name is part of the audit surface the
    panel reads on open, so the stub answers it too. A fixed empty name keeps these
    tests about what they are about (the three empty states); the name's own
    behaviour is covered end to end against a real bridge in
    `tools/caspar-bridge/tests/audit-actor.integration.test.ts`.
  */
  let operatorName = '';
  const stub = {
    audit: {
      recent: () => Promise.resolve(entries),
      health: () => Promise.resolve(health),
      operatorName: () => operatorName,
      setOperatorName: (name: string) => {
        operatorName = name;
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
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
  // The panel fetches the tail and the health reading together; let both settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const text = (): string => openDialog()?.textContent ?? '';

describe('B-141 — the audit panel tells three empty states apart', () => {
  it('NO WRITER CONFIGURED — says so, and never says the session was quiet', async () => {
    stubBridge({ configured: false, path: null, errorCount: 0, lastError: null });
    await render();
    expect(text()).toContain('No audit record is configured');
    expect(text()).toContain('--audit-log-path');
    // The whole point: the reassuring sentence must be ABSENT here.
    expect(text()).not.toContain('No audit entries yet.');
  });

  it('THE WRITER IS FAILING — says entries are MISSING, and quotes the failure', async () => {
    stubBridge({
      configured: true,
      path: '/var/cg/audit.ndjson',
      errorCount: 3,
      lastError: 'ENOSPC: no space left on device',
    });
    await render();
    expect(text()).toContain('MISSING');
    expect(text()).toContain('3 failures');
    // The operator needs both the cause and the place, or the report is unactionable.
    expect(text()).toContain('ENOSPC: no space left on device');
    expect(text()).toContain('/var/cg/audit.ndjson');
    expect(text()).not.toContain('No audit entries yet.');
  });

  it('a SINGLE failure reads "1 failure", not "1 failures"', async () => {
    stubBridge({ configured: true, path: null, errorCount: 1, lastError: 'EACCES' });
    await render();
    expect(text()).toContain('1 failure)');
  });

  it('CONFIGURED, HEALTHY AND GENUINELY EMPTY — and ONLY here — the quiet sentence appears', async () => {
    stubBridge(HEALTHY);
    await render();
    expect(text()).toContain('No audit entries yet.');
  });

  it('the fault states are ANNOUNCED as status, not as an alert', async () => {
    /*
      `Notice`'s `refusal` role defaults its ARIA channel to `alert`, which is for
      the consequence of something the operator JUST DID. This is a standing fact
      about the instrument, read when the dialog opens — announcing it as an alert
      would interrupt for a condition that has been true all session.
    */
    stubBridge({ configured: false, path: null, errorCount: 0, lastError: null });
    await render();
    const notice = openDialog()?.querySelector('[data-notice="refusal"]');
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute('role')).toBe('status');
  });

  it('a FILTER that matches nothing is not "nothing happened" either', async () => {
    /*
      The fourth reading, and it is the same mistake one level in: a live
      instrument with rows in it, filtered down to none, is a statement about the
      FILTER. Reporting it as "no audit entries yet" would tell the operator their
      session was quiet while the unfiltered log sits behind the dropdown.
    */
    stubBridge(HEALTHY);
    await render();
    const select = openDialog()?.querySelector('select');
    expect(select).not.toBeNull();
    await act(async () => {
      const el = select as HTMLSelectElement;
      el.value = 'take';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(text()).toContain('No audit entries match this filter.');
    expect(text()).not.toContain('No audit entries yet.');
  });

  it('with rows present, no empty state is rendered at all', async () => {
    const row: AuditEntry = {
      ts: new Date().toISOString(),
      actor: 'operator',
      action: 'take',
      itemId: 'item1',
      templateId: 'lower-third',
      outcome: 'ok',
    };
    stubBridge(HEALTHY, [row]);
    await render();
    expect(text()).not.toContain('No audit entries');
    expect(text()).toContain('item1');
    expect(text()).toContain('lower-third');
  });

  it('a REFUSED row shows the code that refused it — the field a dispute turns on', async () => {
    const row: AuditEntry = {
      ts: new Date().toISOString(),
      actor: 'operator',
      action: 'take',
      itemId: 'item1',
      outcome: 'failed',
      errorCode: 'live-source-unassigned',
    };
    stubBridge(HEALTHY, [row]);
    await render();
    expect(text()).toContain('live-source-unassigned');
    expect(text()).toContain('failed');
  });
});
