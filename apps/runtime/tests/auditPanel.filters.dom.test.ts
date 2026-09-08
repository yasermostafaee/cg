// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import type { FixedLayerBank, TemplateInfo } from '@cg/shared-ipc';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 8 — what the audit log took from `03-audit-log.html` beyond
 * its look: a search over what the rows SHOW, a `Result` filter over the schema's outcomes,
 * the footer's `N of M events` count, and `Reset filters`. Each is a narrowing of the tail
 * the bridge already answered; none is a second source of truth (`audit.recent` is still
 * asked by action and actor, and only by those).
 *
 * `B-141`'s rule survives every one of them: a filter that empties the list says "no audit
 * entries match this filter", never "nothing happened".
 */

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '98': 'زیرنویس اصلی' },
  low: { start: 1, count: 9 },
};
const THREE_FRAMES: TemplateInfo = {
  templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
  name: 'comp1',
  sourceFileName: '3ghab.vcg',
  templateType: 'custom',
  fields: [],
};
const OK_ON_BED_1: AuditEntry = {
  ts: '2026-09-08T09:15:31.343Z',
  actor: 'desk 2',
  action: 'take',
  itemId: 'item-9e064614-8e46-483a-82fe-0b750598cf88',
  templateId: THREE_FRAMES.templateId,
  slot: { channel: 1, layer: 9, server: 'primary' },
  outcome: 'ok',
};
const REFUSED_ON_98: AuditEntry = {
  ts: '2026-09-08T09:12:21.924Z',
  actor: 'desk 2',
  action: 'take',
  itemId: 'item-e602d912-5d9a-443d-b79e-a4d392f274a9',
  templateId: THREE_FRAMES.templateId,
  slot: { channel: 1, layer: 98, server: 'primary' },
  outcome: 'failed',
  errorCode: 'amcp-404',
  command: 'CG 1-98 ADD 0 "http://192.168.21.93:64373/template/e506e319" 0 "…"',
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

function stubBridge(entries: AuditEntry[]): void {
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
    templates: { list: () => Promise.resolve([THREE_FRAMES]) },
    fixedLayers: { config: () => Promise.resolve(BANK) },
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

const dialog = (): HTMLElement => {
  const d = openDialog();
  if (d === null) throw new Error('the audit log did not open');
  return d;
};
const rows = (): HTMLElement[] => [...dialog().querySelectorAll<HTMLElement>('[data-audit-row]')];
const count = (): string => dialog().querySelector('[data-audit-count]')?.textContent ?? '';

async function type(selector: string, value: string): Promise<void> {
  const el = dialog().querySelector<HTMLInputElement>(selector);
  if (el === null) throw new Error(`no ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

async function select(selector: string, value: string): Promise<void> {
  const el = dialog().querySelector<HTMLSelectElement>(selector);
  if (el === null) throw new Error(`no ${selector}`);
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('§8 — the reference’s filters over the tail the bridge answered', () => {
  it('counts what is shown of what was fetched, and offers Reset only while narrowing', async () => {
    stubBridge([OK_ON_BED_1, REFUSED_ON_98]);
    await render();
    expect(count()).toBe('2 of 2 events');
    expect(dialog().querySelector('[data-audit-reset]')).toBeNull();
    await select('#audit-result', 'failed');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.querySelector('[data-audit-outcome]')?.textContent).toBe('failed');
    expect(count()).toBe('1 of 2 events');
    const reset = dialog().querySelector<HTMLButtonElement>('[data-audit-reset]');
    expect(reset).not.toBeNull();
    await act(async () => {
      reset?.click();
      await Promise.resolve();
    });
    expect(rows()).toHaveLength(2);
    expect(count()).toBe('2 of 2 events');
    expect(dialog().querySelector('[data-audit-reset]')).toBeNull();
  });

  it('the Result options are the schema’s outcomes and nothing hand-kept', async () => {
    stubBridge([OK_ON_BED_1]);
    await render();
    const options = [...(dialog().querySelectorAll('#audit-result option') ?? [])].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual(['all', 'ok', 'failed', 'timeout']);
    // …and the Action select is still the FIRST select in the dialog (its own tests find it so).
    expect(dialog().querySelector('select')?.id).toBe('audit-action');
  });

  it('the search reads what the row SHOWS — the row’s name, the code, the refused line', async () => {
    stubBridge([OK_ON_BED_1, REFUSED_ON_98]);
    await render();
    // The alias the operator sees, not a field the row keeps to itself.
    await type('input[type="search"]', 'زیرنویس');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.querySelector('[data-audit-names]')?.textContent).toContain('زیرنویس اصلی');
    await type('input[type="search"]', 'amcp-404');
    expect(rows()).toHaveLength(1);
    await type('input[type="search"]', 'Bed 1');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.querySelector('[data-audit-names]')?.textContent).toBe('Bed 1 · 3ghab');
  });

  it('a search that empties the list is a statement about the filter, not about the session', async () => {
    stubBridge([OK_ON_BED_1]);
    await render();
    await type('input[type="search"]', 'nothing-like-this');
    expect(rows()).toHaveLength(0);
    expect(dialog().textContent).toContain('No audit entries match this filter.');
    expect(dialog().textContent).not.toContain('No audit entries yet.');
    expect(count()).toBe('0 of 1 events');
  });

  it('golden rule 11 — the coordinate stays in the entry, beside the name, and the code under the outcome', async () => {
    stubBridge([REFUSED_ON_98]);
    await render();
    const row = rows()[0];
    expect(row?.querySelector('[data-audit-slot]')?.textContent).toBe('on 1-98');
    // The code is still on the row (`B-209`), now under the outcome it explains.
    expect(row?.querySelector('[data-audit-outcome]')?.textContent).toBe('failed');
    expect(row?.querySelector('[data-audit-error-code]')?.textContent).toBe('amcp-404');
    expect(
      row
        ?.querySelector('[data-audit-outcome]')
        ?.parentElement?.contains(row.querySelector('[data-audit-error-code]')),
    ).toBe(true);
  });
});
