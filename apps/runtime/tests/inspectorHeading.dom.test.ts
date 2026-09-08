// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { templateDisplayName } from '../src/renderer/features/library/templateName.js';
import { operatorRowName } from '../src/renderer/ui/operatorNaming.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` PHASE 6 — owner answer A14 (a), `R-061` (a): **the Inspector is
 * titled by the ROW's name, and the title follows the selection.**
 *
 * Golden rule 11: an operator surface names things in the operator's words. Drafts are per
 * row and survive a round trip (Phase 5), so the risk of editing the WRONG row's draft is
 * real — and the heading is what the operator reads before typing.
 *
 * The PROPERTY is asserted, not the string: the heading carries whatever `operatorRowName`
 * — the one composition, fed by the bank the mock publishes and the registry — names the
 * selected row, it changes when the selection changes, and the ids are on the `title`, never
 * in the sentence. Nothing here spells `Layer 74`.
 */

class NoopResizeObserver {
  observe(): void {
    /* geometry is measured in Playwright */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW_A = 74;
const ROW_B = 75;
const TEMPLATE_NAME = 'heading fixture';

/** The template's DISPLAY name, by the one rule every surface uses (it prefers the file name). */
async function templateLabel(): Promise<string> {
  const info = (await cg.templates.list()).find((t) => t.templateId === 'tpl-heading');
  if (info === undefined) throw new Error('the fixture template is not in the registry');
  return templateDisplayName(info);
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cg: RuntimeBridge;

beforeEach(async () => {
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = true;
  installMemoryStorage();
  cg = createMockBridge();
  window.cg = cg;
  await cg.templates.import({
    template: {
      templateId: 'tpl-heading',
      name: TEMPLATE_NAME,
      sourceFileName: 'heading.vcg',
      templateType: 'lower-third',
      fields: [{ id: 'anchor', label: 'Anchor', type: 'text', required: false, default: '' }],
    },
    html: '<!doctype html><html><body>fixture</body></html>',
  });
  for (const [layer, itemId] of [
    [ROW_A, 'item-heading-a'],
    [ROW_B, 'item-heading-b'],
  ] as const) {
    const res = await cg.fixedLayers.load({
      channel: 1,
      layer,
      itemId,
      templateId: 'tpl-heading',
      fields: {},
    });
    expect(res.accepted, `row ${String(layer)} loads`).toBe(true);
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(App));
    await flush();
  });
  await act(flush);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

function row(layer: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-layer="${String(layer)}"]`);
  if (el === null) throw new Error(`no row for layer ${String(layer)}`);
  return el;
}

async function selectRow(layer: number): Promise<void> {
  const body = row(layer).querySelector<HTMLElement>('[data-row-body]');
  if (body === null) throw new Error('no row body to select');
  await act(async () => {
    body.click();
    await flush();
  });
}

function heading(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[aria-label="Inspector"] [data-inspector-heading]',
  );
  if (el === null) throw new Error('the Inspector has no heading');
  return el;
}

/** What the ONE composition names this row, from the bank and registry the mock publishes. */
async function expectedName(layer: number, itemId: string): Promise<string> {
  const bank = await cg.fixedLayers.config();
  const templates = new Map<string, TemplateInfo>(
    (await cg.templates.list()).map((t) => [t.templateId, t]),
  );
  const name = operatorRowName(
    { itemId, templateId: 'tpl-heading', slot: { channel: 1, layer } },
    bank,
    templates,
  );
  const first = name.names[0];
  if (first === undefined) throw new Error('operatorRowName named nothing');
  return first;
}

describe('R-061 (a) — the Inspector heading is the selected ROW’s operator name', () => {
  it('🔴 carries the row’s name — not the template’s, not an id — and puts the ids on its title', async () => {
    await selectRow(ROW_A);
    const expected = await expectedName(ROW_A, 'item-heading-a');
    // POSITIVE CONTROL for the assertion below: the row's name is not the template's display
    // name, so a heading that still showed the template could not pass by coincidence.
    expect(expected).not.toBe(await templateLabel());

    const h = heading();
    expect(h.textContent?.trim()).toBe(expected);
    expect(h.textContent).not.toContain('item-heading-a');
    expect(h.textContent).not.toContain('tpl-heading');
    expect(h.getAttribute('title')).toContain('item-heading-a');
    expect(h.getAttribute('title')).toContain('tpl-heading');
    // Isolated for bidi: a Persian alias beside Latin chrome must not be rearranged.
    expect(h.querySelector('bdi')?.textContent?.trim()).toBe(expected);
  });

  it('🔴 follows the selection — a different row, a different heading', async () => {
    await selectRow(ROW_A);
    const a = heading().textContent?.trim();
    await selectRow(ROW_B);
    const b = heading().textContent?.trim();
    expect(b).toBe(await expectedName(ROW_B, 'item-heading-b'));
    expect(b).not.toBe(a);
  });

  it('the template moves to the line beneath, id on hover — what the row carries, not what it is', async () => {
    await selectRow(ROW_A);
    const line = document.querySelector<HTMLElement>(
      '[aria-label="Inspector"] [data-inspector-template]',
    );
    expect(line?.textContent).toContain(await templateLabel());
    expect(line?.getAttribute('title')).toBe('tpl-heading');
    expect(line?.textContent).not.toContain('tpl-heading');
  });
});
