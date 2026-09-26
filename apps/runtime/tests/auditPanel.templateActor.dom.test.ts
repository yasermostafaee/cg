// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import { TEMPLATE_ACTOR } from '@cg/shared-ipc';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { fillBridgeStub } from './support/authStub.js';

/**
 * 🔴 `SELF-STOP-24 · REPLY 1` §R5 — **WHAT THE OWNER WILL READ IN THE LOG WHEN A TEMPLATE
 * STOPPED ITS OWN ROW.**
 *
 * The plant check for `C-013` is "the row stops reading ON AIR by itself". The check after it is
 * "and the record says who did it" — because a row that comes off air with nobody at the console
 * is exactly the event the log has to be able to explain at 03:00. So the line is MEASURED here
 * and quoted into ADR 0009's plant check 1, rather than composed by reading the JSX.
 *
 * ⚠ **The actor reads as the bare word `template`.** Not "the template", not a template name,
 * and not `unattributed` — the last is what it would have said before `TEMPLATE_ACTOR` existed,
 * which would have filed a graphic ending its own run in the same bucket as housekeeping.
 *
 * ⚠ **The ACTION is the existing `stop`.** Same verb, same path, same column; only the WHO
 * differs, which is what an actor field is for.
 */

const TEMPLATE_STOP: AuditEntry = {
  ts: '2026-09-16T12:18:47.561Z',
  actor: TEMPLATE_ACTOR,
  action: 'stop',
  itemId: 'item-e602d912-1c4a-4f0b-9a31-7d8c5f2e4b10',
  templateId: 'f00a5363-3a7e-4a4b-9f0e-5c2b1d7a9e44',
  slot: { channel: 1, layer: 10, server: 'primary' },
  outcome: 'ok',
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

/**
 * A bank and a template catalogue shaped like the PLANT, so the measured line is the one the
 * owner will actually read rather than a fixture's degenerate case.
 *
 * With no bank the place column reads `layer 1-10 (not a row)` — true, and what an unconfigured
 * console shows, but not what ADR 0009's plant check 1 is performed against. That check is "a
 * logo set to 2 passes", so the row here is a `logo` on a configured bank.
 */
const BANK = {
  channel: 1,
  start: 10,
  count: 4,
  aliases: { '10': 'logo' },
  low: { start: 50, count: 10, visibility: {} },
};

const TEMPLATE_INFO = {
  templateId: 'f00a5363-3a7e-4a4b-9f0e-5c2b1d7a9e44',
  name: 'station-logo',
  sourceFileName: 'station-logo.vcg',
  templateType: 'logo-bug',
  fields: [],
};

function stubBridge(entries: AuditEntry[], bank: unknown = BANK): void {
  const stub = {
    audit: {
      // `FIELD-FIXES-01` G — the log-folder door (absent outside CG Control).
      canOpenLogFolder: () => false,
      openLogFolder: () => Promise.resolve({ accepted: false }),
      recent: () => Promise.resolve(entries),
      health: () =>
        Promise.resolve({
          configured: true,
          path: '/x/audit.ndjson',
          errorCount: 0,
          lastError: null,
        }),
      operatorName: () => 'desk 2',
      setOperatorName: () => undefined,
    },
    templates: { list: () => Promise.resolve([TEMPLATE_INFO]) },
    fixedLayers: { config: () => Promise.resolve(bank) },
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
    await Promise.resolve();
  });
}

const dialog = (): HTMLElement => {
  const d = openDialog();
  if (d === null) throw new Error('the audit log did not open');
  return d;
};
const rows = (): HTMLElement[] => [...dialog().querySelectorAll<HTMLElement>('[data-audit-row]')];

describe('REPLY 1 §R5 — a template stop reads as the template in the LOG', () => {
  it('🔴 the actor cell is the bare word `template`', async () => {
    stubBridge([TEMPLATE_STOP]);
    await render();

    const row = rows()[0];
    expect(row, 'no row rendered — nothing below is measured').toBeDefined();
    const actor = row?.querySelector<HTMLElement>('[data-audit-actor]');
    expect(actor?.textContent).toBe('template');
    expect(actor?.getAttribute('data-audit-actor')).toBe(TEMPLATE_ACTOR);
    // Not the value it would have carried before `TEMPLATE_ACTOR` existed.
    expect(actor?.textContent).not.toBe('unattributed');
  });

  it('the ACTION column is the existing `stop` — no new verb', async () => {
    stubBridge([TEMPLATE_STOP]);
    await render();

    expect(rows()[0]?.textContent, 'the verb changed').toContain('stop');
  });

  it('the row carries the real LAYER COORDINATE, as golden rule 11 requires of a log entry', async () => {
    stubBridge([TEMPLATE_STOP]);
    await render();

    const slot = rows()[0]?.querySelector<HTMLElement>('[data-audit-slot]');
    expect(slot?.getAttribute('data-audit-slot')).toBe('1-10');
    expect(slot?.textContent).toBe('on 1-10');
  });

  it('an UNCONFIGURED console still names the layer, as "not a row"', async () => {
    // The other real console: no fixed bank, so there is no alias to use. The coordinate is
    // still there, which is the half golden rule 11 insists on.
    stubBridge([TEMPLATE_STOP], null);
    await render();

    const line = (rows()[0]?.textContent ?? '').trim();
    expect(line).toContain('layer 1-10 (not a row)');
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2}templatestop/);
  });

  it('🔴 the WHOLE LINE, measured — this is the string quoted in ADR 0009', async () => {
    /*
      🔴 THE OWNER'S CHECK. Whitespace-collapsed, because the row is a CSS grid of separate
      cells and the DOM's own spacing between them is a layout fact rather than a wording one.
      What is pinned is the ORDER and the CONTENT: the local clock, the actor, the verb, the
      coordinate, and the shortened ids.

      ⚠ The TIME is deliberately not pinned to a literal. `auditTimeParts` reads the record's UTC
      stamp in the CONSOLE'S OWN ZONE, so a literal here would assert the machine's timezone and
      fail on any box that is not the author's. The shape is pinned instead.
    */
    stubBridge([TEMPLATE_STOP]);
    await render();

    /*
      ⚠ **THE CELLS ABUT WITH NO WHITESPACE.** The row is a CSS grid of separate spans, so
      `textContent` concatenates them directly — `15:48:47templatestop…`, not a spaced sentence.
      The first draft of this case asserted a space after the clock and failed on exactly that.
      The grid supplies the gaps on screen; the DOM does not, and a test that expects them is
      testing a layout fact in an engine that has no layout (golden rule 12(c)).
    */
    const line = (rows()[0]?.textContent ?? '').trim();

    expect(line, 'the line lost its clock').toMatch(/^\d{2}:\d{2}:\d{2}/);
    /*
      ⚠ The TIME is a SHAPE, not a literal. `auditTimeParts` reads the record's UTC stamp in the
      CONSOLE'S OWN ZONE, so pinning `15:48:47` would assert the test machine's timezone —
      true on the plant (UTC+3:30) and false on CI.
    */
    expect(line, 'the three fixed columns changed order or wording').toMatch(
      /^\d{2}:\d{2}:\d{2}templatestop/,
    );
    expect(line, 'the row is not named the operator way').toContain('logo · station logo');
    // The display-name rule renders the source file's stem, spaced — `station logo`, not the id.
    expect(line, 'the template name is gone').toContain('station logo');
    expect(line, 'the coordinate is gone').toContain('on 1-10');
    // `B-211` — ids shortened for the eye, complete in the title and on the copy button.
    expect(line, 'the item id is gone').toContain('e602d912');
    expect(line, 'the template id is gone').toContain('f00a5363');
    expect(line, 'the outcome is gone').toContain('ok');
    // And the full ids are still one hover away, which is what makes the shortening safe.
    expect(rows()[0]?.innerHTML).toContain(TEMPLATE_STOP.itemId as string);
  });
});
