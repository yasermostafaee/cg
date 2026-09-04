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
  low: { start: 1, count: 9 },
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
  slot: { channel: 1, layer: 9, server: 'primary' },
  outcome: 'failed',
  errorCode: 'amcp-404',
  command:
    'CG 1-9 ADD 0 "http://192.168.21.93:64373/template/e506e319-6e68-4603-a5f4-290b21616250?cw=1920&ch=1080" 0 "…"',
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
  slot: { channel: 1, layer: 9, server: 'primary' },
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
      recent: () => Promise.resolve(entries),
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
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const rows = (): HTMLElement[] => [
  ...(openDialog()?.querySelectorAll<HTMLElement>('[data-audit-row]') ?? []),
];
const text = (): string => openDialog()?.textContent ?? '';

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
    expect(cell?.textContent).toBe(expected.time);
    expect(cell?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(cell?.getAttribute('title')).toContain('2026-09-04T12:18:47.561Z');
    // The raw ISO string is NOT what the cell shows.
    expect(cell?.textContent).not.toContain('Z');
  });

  it('prints the date ONCE per day, as a band, only where the local day changes', async () => {
    stubBridge([LOGO_ON_LAYER_90, REFUSED_ON_BED_1, YESTERDAY], [LOGO, THREE_FRAMES], BANK);
    await render();
    const bands = [...(openDialog()?.querySelectorAll('[data-audit-date]') ?? [])].map((b) =>
      b.getAttribute('data-audit-date'),
    );
    const today = auditTimeParts(LOGO_ON_LAYER_90.ts).date;
    const yesterday = auditTimeParts(YESTERDAY.ts).date;
    // Two rows share the first day and get ONE band; the older row gets its own.
    expect(bands).toEqual(today === yesterday ? [today] : [today, yesterday]);
  });
});

describe('B-211 — names first, ids beneath and never deleted', () => {
  it('names the ROW as the Layers table does and the TEMPLATE as the picker does', async () => {
    stubBridge([REFUSED_ON_BED_1, LOGO_ON_LAYER_90], [THREE_FRAMES, LOGO], BANK);
    await render();
    const [bed, logo] = rows();
    expect(bed?.querySelector('[data-audit-names]')?.textContent).toBe('Bed 1 · 3ghab');
    // Layer 90 has no alias — the default name, from the same rule the table uses; and the
    // template's FILE name outranks its manifest name, as on the row and in the picker.
    expect(logo?.querySelector('[data-audit-names]')?.textContent).toBe('Layer 10 · ارم روی انتن');
  });

  it('keeps BOTH ids: shortened in the text, complete in the title, and copyable', async () => {
    stubBridge([REFUSED_ON_BED_1], [THREE_FRAMES], BANK);
    await render();
    const row = rows()[0];
    const item = row?.querySelector<HTMLElement>('[data-audit-id="item"]');
    const template = row?.querySelector<HTMLElement>('[data-audit-id="template"]');
    expect(item?.getAttribute('data-audit-full-id')).toBe(REFUSED_ON_BED_1.itemId);
    expect(template?.getAttribute('data-audit-full-id')).toBe(REFUSED_ON_BED_1.templateId);
    expect(item?.querySelector('code')?.textContent).toBe('item-9e064614…');
    expect(item?.querySelector('code')?.getAttribute('title')).toBe(REFUSED_ON_BED_1.itemId);
    expect(template?.querySelector('code')?.textContent).toBe('e506e319…');
    // The copy control names what it copies.
    expect(item?.querySelector('button[aria-label="Copy item id"]')).not.toBeNull();
    expect(template?.querySelector('button[aria-label="Copy template id"]')).not.toBeNull();
  });

  it('the copy button writes the FULL id to the clipboard', async () => {
    stubBridge([REFUSED_ON_BED_1], [THREE_FRAMES], BANK);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();
    const button = rows()[0]?.querySelector<HTMLButtonElement>('button[aria-label="Copy item id"]');
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
    expect(row?.querySelector('[data-audit-names]')?.textContent).toBe('Layer 10');
    expect(row?.querySelector('[data-audit-id="template"] code')?.textContent).toBe('f00a5363…');
  });

  it('an import names only the template — it has no row', async () => {
    stubBridge([IMPORT], [LOGO], BANK);
    await render();
    const row = rows()[0];
    // The FILE name outranks the manifest name — the same rule the row and the picker use.
    expect(row?.querySelector('[data-audit-names]')?.textContent).toBe('ارم روی انتن');
    expect(row?.querySelector('[data-audit-id="item"]')).toBeNull();
  });

  it('does NOT change the console caveat — naming rows better is not naming people better', async () => {
    stubBridge([REFUSED_ON_BED_1], [THREE_FRAMES], BANK);
    await render();
    expect(text()).toContain('It is a LABEL you typed, not a verified sign-in');
    expect(text()).toContain('it says which console, not which person');
  });
});

describe('B-209 — a refused take shows the line that was refused', () => {
  it('renders the recorded command beside the code', async () => {
    stubBridge([REFUSED_ON_BED_1], [THREE_FRAMES], BANK);
    await render();
    const row = rows()[0];
    expect(row?.querySelector('[data-audit-error-code]')?.textContent).toBe('amcp-404');
    expect(row?.querySelector('[data-audit-command]')?.textContent).toContain('CG 1-9 ADD 0');
    expect(row?.querySelector('[data-audit-command]')?.textContent).toContain(':64373/template/');
  });

  it('an entry recorded before the field existed shows no command line at all', async () => {
    stubBridge([LOGO_ON_LAYER_90], [LOGO], BANK);
    await render();
    expect(rows()[0]?.querySelector('[data-audit-command]')).toBeNull();
  });
});
