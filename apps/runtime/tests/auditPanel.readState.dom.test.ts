// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { fillBridgeStub } from './support/authStub.js';

/**
 * 🔴 `MODAL-TRUTH-01` §3.2/§3.3 — **THE AUDIT LOG DOES NOT ASSERT A COUNT IT CANNOT KNOW,
 * AND IT DOES NOT SIT ON `Reading…` FOREVER.**
 *
 * ── THE TWO CONTRADICTORY STATEMENTS, AND WHICH ONE WAS STALE ───────────────
 *
 * The owner photographed `Reading the audit record…` in the body and `0 of 0 events` in the
 * footer at the same moment. They cannot both be right, and which one is stale is what
 * locates the bug: the BODY was truthful — `health === null` genuinely means "not asked
 * yet" — and the COUNTER was asserting a total of a record it had not opened, because it
 * rendered `entries.length` unconditionally over an `entries` initialised to `[]`.
 *
 * ── AND THE STATE THAT DID NOT EXIST ────────────────────────────────────────
 *
 * With no bridge, `refresh()`'s `Promise.all` rejected, `void refresh()` swallowed it into
 * an unhandled rejection, `health` stayed `null`, and the dialog showed `Reading…` for as
 * long as it was open — silence where an error belongs. Measured, both, before the fix.
 *
 * ⚠ These specs assert what the SURFACE SAYS, never only the state behind it: the whole
 * defect class is a surface that disagrees with its own state. The FOOTER's geometry is
 * the third fix and is NOT here — jsdom has no layout, so a box measured in it passes
 * against a surface of any shape (golden rule 12c). It is measured in Chromium, in
 * `tests/e2e/library-audit-geometry.spec.ts`.
 */

interface Health {
  configured: boolean;
  path: string | null;
  errorCount: number;
  lastError: string | null;
}

const HEALTHY: Health = {
  configured: true,
  path: '/var/cg/audit.ndjson',
  errorCount: 0,
  lastError: null,
};

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

/** `recent` and `health` are the two the panel's own condition turns on; the rest answer. */
function stubBridge(audit: {
  recent: () => Promise<unknown>;
  health: () => Promise<unknown>;
}): void {
  const stub = {
    audit: {
      ...audit,
      operatorName: () => '',
      setOperatorName: () => undefined,
      // `FIELD-FIXES-01` G — the log-folder door (absent outside CG Control).
      canOpenLogFolder: () => false,
      openLogFolder: () => Promise.resolve({ accepted: false }),
    },
    templates: { list: () => Promise.resolve([]) },
    fixedLayers: { config: () => Promise.resolve(null) },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
}

async function renderAt(open: boolean): Promise<void> {
  const r = root;
  if (r === null) throw new Error('no root');
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(AuditPanel, { open, onClose: () => undefined }),
      ),
    );
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await renderAt(true);
}

const dialog = (): HTMLElement => {
  const el = openDialog();
  if (el === null) throw new Error('the audit log did not open');
  return el;
};
const text = (): string => dialog().textContent ?? '';
/** What the footer CLAIMS as a count. Absent means it is claiming none. */
const count = (): string | null =>
  dialog().querySelector('[data-audit-count]')?.textContent ?? null;
const readLabel = (): string | null =>
  dialog().querySelector('[data-audit-read]')?.textContent ?? null;

describe('MODAL-TRUTH-01 §3.2 — the counter claims no number before the read settles', () => {
  it('MID-FLIGHT — no count is claimed, and the body and the footer agree', async () => {
    stubBridge({
      recent: () => new Promise<never>(() => undefined),
      health: () => new Promise<never>(() => undefined),
    });
    await render();

    expect(text()).toContain('Reading the audit record');
    // The defect, stated directly: this used to read `0 of 0 events`.
    expect(count()).toBeNull();
    expect(text()).not.toContain('0 of 0 events');
    expect(readLabel()).toBe('Reading…');
  });

  it('SETTLED AND EMPTY — the count appears, and the body has stopped saying it is reading', async () => {
    stubBridge({ recent: () => Promise.resolve([]), health: () => Promise.resolve(HEALTHY) });
    await render();

    expect(count()).toBe('0 of 0 events');
    expect(text()).not.toContain('Reading the audit record');
    // `B-141`'s narrowest branch is untouched: a live writer that read nothing.
    expect(text()).toContain('No audit entries yet.');
  });
});

describe('MODAL-TRUTH-01 §3.3 — a record that cannot be read says so', () => {
  it('UNREACHABLE — the failure is stated, `Reading…` is gone, and no count is claimed', async () => {
    stubBridge({
      recent: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:7999')),
      health: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:7999')),
    });
    await render();

    expect(text()).toContain('The audit record could not be read');
    // The bridge's own words, so the operator has something to act on.
    expect(text()).toContain('ECONNREFUSED');
    // The defect: it used to sit here indefinitely.
    expect(text()).not.toContain('Reading the audit record');
    expect(count()).toBeNull();
    expect(readLabel()).toBe('Not read');
  });

  it('UNREACHABLE — it does not claim the station was quiet', async () => {
    stubBridge({
      recent: () => Promise.reject(new Error('socket hang up')),
      health: () => Promise.reject(new Error('socket hang up')),
    });
    await render();

    // `B-141`'s rule, met by a fourth reading: a negative observation is not a result.
    expect(text()).not.toContain('No audit entries yet.');
    expect(text()).not.toContain('No audit record is configured');
  });

  it('a CLOSED panel forgets the failure — reopening starts from Reading…, not from it', async () => {
    let failing = true;
    const pending = (): Promise<never> => new Promise<never>(() => undefined);
    stubBridge({
      recent: () => (failing ? Promise.reject(new Error('socket hang up')) : pending()),
      health: () => (failing ? Promise.reject(new Error('socket hang up')) : pending()),
    });
    await render();
    expect(text()).toContain('The audit record could not be read');

    await renderAt(false);
    failing = false;
    await renderAt(true);

    expect(text()).not.toContain('The audit record could not be read');
    expect(text()).toContain('Reading the audit record');
  });
});
