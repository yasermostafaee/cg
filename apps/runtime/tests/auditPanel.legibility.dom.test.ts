// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import type { FixedLayerBank, TemplateInfo } from '@cg/shared-ipc';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { auditTimeParts } from '../src/renderer/features/audit/auditFormat.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { fillBridgeStub } from './support/authStub.js';

/**
 * ⭐ **`B-210` / `B-211` / `B-209` — THE AUDIT LOG IS LEGIBLE TO THE PERSON WHO HAS TO
 * READ IT AFTER THE FACT.**
 *
 * These are the record's rows from 2026-09-04, rendered the way the operator was shown
 * them that day and the way they are shown now. Three things are pinned, and each is a
 * hazard rather than a preference:
 *
 *   1. the TIME is the control room's clock, to the second, with the UTC stamp one
 *      hover away — not a `…Z` string three and a half hours off the wall clock;
 *   2. the ROW and the TEMPLATE are NAMED (`Bed 1`, `3ghab`), and the ids that make it
 *      a record are still there — shortened in the text, complete in the title, and
 *      copyable — never deleted;
 *   3. a refused take shows the LINE that was refused beside the code.
 *
 * The bank and the registry are the incident's own shapes.
 */

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '98': 'زیرنویس اصلی', '99': 'لوگوی اصلی' },
  low: { start: 50, count: 9 },
};

const THREE_FRAMES: TemplateInfo = {
  templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
  name: 'comp1',
  sourceFileName: '3ghab.vcg',
  templateType: 'custom',
  fields: [],
};
const LOGO: TemplateInfo = {
  templateId: 'f00a5363-15d7-4bc1-bf31-6f6b006f75c8',
  name: 'آرم (روی آنتن)',
  sourceFileName: 'ارم-روی-انتن.vcg',
  templateType: 'logo-bug',
  fields: [],
};

const REFUSED_ON_BED_1: AuditEntry = {
  ts: '2026-09-04T12:05:31.343Z',
  actor: 'unattributed',
  action: 'take',
  itemId: 'item-9e064614-8e46-483a-82fe-0b750598cf88',
  templateId: THREE_FRAMES.templateId,
  slot: { channel: 1, layer: 58, server: 'primary' },
  outcome: 'failed',
  errorCode: 'amcp-404',
  command:
    'CG 1-58 ADD 0 "http://192.168.21.93:64373/template/e506e319-6e68-4603-a5f4-290b21616250?cw=1920&ch=1080" 0 "…"',
};
const LOGO_ON_LAYER_90: AuditEntry = {
  ts: '2026-09-04T12:18:47.561Z',
  actor: 'unattributed',
  action: 'take',
  itemId: 'item-e602d912-5d9a-443d-b79e-a4d392f274a9',
  templateId: LOGO.templateId,
  slot: { channel: 1, layer: 90, server: 'primary' },
  outcome: 'failed',
  errorCode: 'amcp-404',
};
const IMPORT: AuditEntry = {
  ts: '2026-09-04T12:12:21.924Z',
  actor: 'unattributed',
  action: 'import',
  templateId: LOGO.templateId,
  outcome: 'ok',
};
/** Cleared the previous evening — a different LOCAL day from the rows above. */
const YESTERDAY: AuditEntry = {
  ts: '2026-09-03T22:25:25.564Z',
  actor: 'unattributed',
  action: 'out',
  itemId: 'item-335557e4-0000-4000-8000-000000000000',
  templateId: THREE_FRAMES.templateId,
  slot: { channel: 1, layer: 58, server: 'primary' },
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

function stubBridge(
  entries: AuditEntry[],
  templates: TemplateInfo[],
  bank: FixedLayerBank | null,
): void {
  const stub = {
    audit: {
      // `FIELD-FIXES-01` G — the log-folder door (absent outside CG Control).
      canDownloadLogs: () => false,
      downloadLogs: () => Promise.resolve({ accepted: false }),
      // `R-083` — the Log reads pages.
      page: () => Promise.resolve({ entries, next: null }),
      onAppended: () => () => undefined,
      health: () =>
        Promise.resolve({
          configured: true,
          path: '/x/audit.ndjson',
          errorCount: 0,
          lastError: null,
        }),
      operatorName: () => '',
      setOperatorName: () => undefined,
    },
    templates: { list: () => Promise.resolve(templates) },
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

const rows = (): HTMLElement[] => [
  ...(openDialog()?.querySelectorAll<HTMLElement>('[data-audit-row]') ?? []),
];

describe('B-210 — the time column is the control room clock', () => {
  it('shows LOCAL time to the second, and keeps the UTC stamp as the title', async () => {
    stubBridge([LOGO_ON_LAYER_90], [LOGO], BANK);
    await render();
    const cell = rows()[0]?.querySelector<HTMLElement>('[data-audit-time]');
    expect(cell).not.toBeNull();
    // The same formatter the panel uses, in this environment's zone — so the assertion is
    // "local, not UTC" wherever the suite runs, and the Tehran arithmetic is pinned in
    // `auditFormat.test.ts`.
    const expected = auditTimeParts(LOGO_ON_LAYER_90.ts);
    expect(cell?.querySelector('strong')?.textContent).toBe(expected.time);
    expect(cell?.querySelector('small')?.textContent).toBe(expected.date);
    expect(cell?.querySelector('strong')?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(cell?.getAttribute('title')).toContain('2026-09-04T12:18:47.561Z');
    // The raw ISO string is NOT what the cell shows.
    expect(cell?.textContent).not.toContain('Z');
  });

  it('prints the local date beneath each row time', async () => {
    stubBridge([LOGO_ON_LAYER_90, REFUSED_ON_BED_1, YESTERDAY], [LOGO, THREE_FRAMES], BANK);
    await render();
    const today = auditTimeParts(LOGO_ON_LAYER_90.ts).date;
    const yesterday = auditTimeParts(YESTERDAY.ts).date;
    expect(rows().map((row) => row.querySelector('[data-audit-time] small')?.textContent)).toEqual([
      today,
      today,
      yesterday,
    ]);
  });
});

describe('B-211 — names first, ids beneath and never deleted', () => {
  it('names the ROW as the Layers table does and the TEMPLATE as the picker does', async () => {
    stubBridge([REFUSED_ON_BED_1, LOGO_ON_LAYER_90], [THREE_FRAMES, LOGO], BANK);
    await render();
    const [bed, logo] = rows();
    expect(bed?.querySelector('[data-audit-names]')?.textContent).toBe('Live layer 58 · 3ghab');
    // Layer 90 has no alias — the default name, from the same rule the table uses; and the
    // template's FILE name outranks its manifest name, as on the row and in the picker.
    expect(logo?.querySelector('[data-audit-names]')?.textContent).toBe('Layer 90 · ارم روی انتن');
  });

  it('keeps both complete ids in the selected event details and makes them copyable', async () => {
    stubBridge([REFUSED_ON_BED_1], [THREE_FRAMES], BANK);
    await render();
    const details = openDialog()?.querySelector('[data-audit-details]');
    const item = details?.querySelector('[data-audit-technical="Item ID"]');
    const template = details?.querySelector('[data-audit-technical="Template ID"]');
    expect(item?.querySelector('code')?.textContent).toBe(REFUSED_ON_BED_1.itemId);
    expect(template?.querySelector('code')?.textContent).toBe(REFUSED_ON_BED_1.templateId);
    expect(item?.querySelector('button[aria-label="Copy Item ID"]')).not.toBeNull();
    expect(template?.querySelector('button[aria-label="Copy Template ID"]')).not.toBeNull();
    expect(rows()[0]?.textContent).not.toContain(REFUSED_ON_BED_1.itemId);
  });

  it('the copy button writes the FULL id to the clipboard', async () => {
    stubBridge([REFUSED_ON_BED_1], [THREE_FRAMES], BANK);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();
    const button = openDialog()?.querySelector<HTMLButtonElement>(
      '[data-audit-details] button[aria-label="Copy Item ID"]',
    );
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(REFUSED_ON_BED_1.itemId);
  });

  it('a layer OUTSIDE the bank is named as CasparCG names it, and said not to be a row', async () => {
    const hidden: AuditEntry = {
      ...YESTERDAY,
      ts: '2026-09-04T11:52:57.629Z',
      itemId: 'item-493243df-86b9-4014-9316-e903c26b069b',
      slot: { channel: 1, layer: 60, server: 'primary' },
    };
    stubBridge([hidden], [THREE_FRAMES], BANK);
    await render();
    expect(rows()[0]?.querySelector('[data-audit-names]')?.textContent).toBe(
      'layer 60 (not a row) · 3ghab',
    );
  });

  it('a template the registry no longer holds falls back to its id, not to a blank', async () => {
    stubBridge([LOGO_ON_LAYER_90], [], BANK);
    await render();
    const row = rows()[0];
    expect(row?.querySelector('[data-audit-names]')?.textContent).toBe('Layer 90');
    expect(
      openDialog()?.querySelector('[data-audit-technical="Template ID"] code')?.textContent,
    ).toBe(LOGO_ON_LAYER_90.templateId);
  });

  it('an import names only the template — it has no row', async () => {
    stubBridge([IMPORT], [LOGO], BANK);
    await render();
    const row = rows()[0];
    // The FILE name outranks the manifest name — the same rule the row and the picker use.
    expect(row?.querySelector('[data-audit-names]')?.textContent).toBe('ارم روی انتن');
    expect(openDialog()?.querySelector('[data-audit-technical="Item ID"]')).toBeNull();
  });

  /*
    🔴 `OPERATOR-NAME-SWEEP-01` — **`B-211`'s "does NOT change the console caveat" is RETIRED
    because the caveat is.**

    It asserted that naming ROWS better had not quietly also renamed the PERSON — a real and
    careful distinction at the time, pinned by quoting the caveat's own sentence. That sentence
    no longer exists: identity is proven, and the panel states the record rather than
    qualifying it.

    ⚠ The half of `B-211` that still matters is untouched above — the row NAMES and the ids
    beneath them. Only the assertion that quoted the retired sentence is gone.
  */
  it('renders the recorded command beside the code', async () => {
    stubBridge([REFUSED_ON_BED_1], [THREE_FRAMES], BANK);
    await render();
    const details = openDialog()?.querySelector('[data-audit-details]');
    expect(details?.textContent).toContain('amcp-404');
    expect(details?.textContent).toContain('CG 1-58 ADD 0');
    expect(details?.textContent).toContain(':64373/template/');
  });

  it('an entry recorded before the field existed shows no command line at all', async () => {
    stubBridge([LOGO_ON_LAYER_90], [LOGO], BANK);
    await render();
    expect(openDialog()?.querySelector('[data-audit-technical="Command"]')).toBeNull();
  });
});

describe('CENTRAL-BRIDGE-01 — a row names the console MACHINE as well as the user', () => {
  it('the actor cell carries the console machine as its title, and the sentence stays the user', async () => {
    const fromConsole: AuditEntry = {
      ...LOGO_ON_LAYER_90,
      actor: 'Sara',
      consoleAddress: '192.0.2.50',
    };
    stubBridge([fromConsole, LOGO_ON_LAYER_90], [LOGO], BANK);
    await render();
    const [attributed, older] = rows().map((r) =>
      r.querySelector<HTMLElement>('[data-audit-actor]'),
    );
    expect(attributed?.textContent).toBe('Sara');
    expect(attributed?.getAttribute('title')).toBe('From 192.0.2.50');
    expect(attributed?.getAttribute('data-audit-console')).toBe('192.0.2.50');
    // CONTROL: a row recorded without the field (every row before this release, and any row no
    // console caused) has no title and no machine — not an empty one.
    expect(older?.textContent).toBe('unattributed');
    expect(older?.hasAttribute('title')).toBe(false);
    expect(older?.hasAttribute('data-audit-console')).toBe(false);
  });
});
