// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` PHASE 5 — THREE THINGS STAY INDEPENDENT, proved on the whole App.
 *
 * Which row is SELECTED (`App`'s own state), which rows are IN PVW (the bridge's rehearse
 * set) and whether the monitors are SHOWN (`useShellLayout`'s flag). The subject is `App`
 * itself, not a harness that re-wires the three: a coupling is a wiring defect, and the only
 * place the three are wired together is here. `workspace-independence.spec.ts` is the same
 * proof in a real browser; this one is cheap enough to run on every gate.
 *
 * Every PAIR, BOTH directions — a single-direction test passes against a coupling that
 * runs the other way. Each case was RED under its own planted coupling in `App.tsx` and
 * green under the other five (`design.md` §12.5).
 *
 * The rehearse set is read from the BRIDGE, not from a badge; the selection from the row's
 * `aria-pressed` and the Inspector's existence, which is derived from it; the monitors from
 * the strip's presence and the toggle's `aria-expanded`.
 */

// jsdom has no ResizeObserver; the density and fit measurements it drives are geometry,
// covered in Playwright, and none of these assertions is about a box.
class NoopResizeObserver {
  observe(): void {
    /* measured for real in the browser */
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

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cg: RuntimeBridge;
let storage: Storage;

beforeEach(async () => {
  // The offline mock, armed exactly as the E2E harness arms it: test mode plus the
  // declared bank, so the Layers list has rows to load onto.
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = true;
  storage = installMemoryStorage();
  cg = createMockBridge();
  window.cg = cg;
  await cg.templates.import({
    template: {
      templateId: 'tpl-ind',
      name: 'independence fixture',
      sourceFileName: 'ind.vcg',
      templateType: 'lower-third',
      fields: [{ id: 'anchor', label: 'Anchor', type: 'text', required: false, default: '' }],
    },
    html: '<!doctype html><html><body>fixture</body></html>',
  });
  for (const [layer, itemId] of [
    [ROW_A, 'item-ind-a'],
    [ROW_B, 'item-ind-b'],
  ] as const) {
    const res = await cg.fixedLayers.load({
      channel: 1,
      layer,
      itemId,
      templateId: 'tpl-ind',
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
  // The rows are up, bound, and carry their items.
  await act(flush);
  expect(row(ROW_A).getAttribute('data-item-id')).toBe('item-ind-a');
  expect(row(ROW_B).getAttribute('data-item-id')).toBe('item-ind-b');
  /*
    🔴 `MONITORS-01` — the console now boots with the strip FOLDED AWAY
    (`DEFAULT_MONITORS_SHOWN`; `design.md` §19), so every pair below opens it first. What this
    file proves — the three axes are independent — is untouched by which way the default
    points, so the state each test was written against is established here rather than each
    test's assertions being inverted, which would turn six coupling proofs into six others.
  */
  if (document.querySelector('button[aria-label="Show monitors"]') !== null) {
    await click(document.querySelector('button[aria-label="Show monitors"]'));
  }
  expect(stripPresent(), 'the strip is up before the pairs run').toBe(true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

/** Let every pending snapshot pull and push settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

function row(layer: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-layer="${String(layer)}"]`);
  if (el === null) throw new Error(`no row for layer ${String(layer)}`);
  return el;
}

function pressed(layer: number): string | null {
  return row(layer).getAttribute('aria-pressed');
}

function inspector(): HTMLElement | null {
  return document.querySelector('[aria-label="Inspector"]');
}

function stripPresent(): boolean {
  return document.querySelector('[data-monitor-strip]') !== null;
}

function toggle(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Hide monitors"], button[aria-label="Show monitors"]',
  );
  if (el === null) throw new Error('no monitors toggle');
  return el;
}

async function click(el: Element | null): Promise<void> {
  if (el === null) throw new Error('nothing to click');
  await act(async () => {
    (el as HTMLElement).click();
    await flush();
  });
}

async function selectRow(layer: number): Promise<void> {
  await click(row(layer).querySelector('[data-row-body]'));
}

async function pressVerb(layer: number, name: 'ON PVW' | 'OFF PVW'): Promise<void> {
  await click(row(layer).querySelector(`button[aria-label="${name}"]`));
}

async function pvw(): Promise<string[]> {
  return (await cg.rehearse.state()).map((r) => r.itemId).sort();
}

describe('selected ↔ in PVW', () => {
  it('selecting a row neither adds it to PVW nor removes another from it', async () => {
    await pressVerb(ROW_A, 'ON PVW');
    expect(await pvw()).toEqual(['item-ind-a']);

    await selectRow(ROW_B);
    expect(pressed(ROW_B)).toBe('true');
    expect(await pvw()).toEqual(['item-ind-a']);
    await selectRow(ROW_A);
    expect(pressed(ROW_A)).toBe('true');
    expect(await pvw()).toEqual(['item-ind-a']);
    await selectRow(ROW_A); // deselect
    expect(pressed(ROW_A)).toBe('false');
    expect(await pvw()).toEqual(['item-ind-a']);
  });

  it('putting a row on PVW, or taking it off, neither selects it nor deselects the selected row', async () => {
    await selectRow(ROW_A);
    expect(pressed(ROW_A)).toBe('true');
    expect(inspector()).not.toBeNull();

    await pressVerb(ROW_B, 'ON PVW');
    expect(await pvw()).toEqual(['item-ind-b']);
    expect(pressed(ROW_A)).toBe('true');
    expect(pressed(ROW_B)).toBe('false');
    expect(inspector()).not.toBeNull();

    await pressVerb(ROW_B, 'OFF PVW');
    expect(await pvw()).toEqual([]);
    expect(pressed(ROW_A)).toBe('true');
    expect(pressed(ROW_B)).toBe('false');
  });
});

describe('selected ↔ monitors shown', () => {
  it('selecting and deselecting a row leaves the monitors as they were — shown, and hidden', async () => {
    expect(stripPresent()).toBe(true);
    await selectRow(ROW_A);
    expect(inspector()).not.toBeNull();
    expect(stripPresent()).toBe(true);

    await click(toggle());
    expect(stripPresent()).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    await selectRow(ROW_A); // deselect
    expect(inspector()).toBeNull();
    expect(stripPresent()).toBe(false);
    await selectRow(ROW_B); // select another
    expect(inspector()).not.toBeNull();
    expect(stripPresent()).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('hiding and showing the monitors neither deselects the row nor closes its Inspector', async () => {
    await selectRow(ROW_A);
    expect(pressed(ROW_A)).toBe('true');

    await click(toggle());
    expect(stripPresent()).toBe(false);
    expect(pressed(ROW_A)).toBe('true');
    expect(inspector()).not.toBeNull();

    await click(toggle());
    expect(stripPresent()).toBe(true);
    expect(pressed(ROW_A)).toBe('true');
    expect(inspector()).not.toBeNull();
  });
});

describe('in PVW ↔ monitors shown', () => {
  it('putting a row on PVW does not bring hidden monitors back, and taking it off does not hide shown ones', async () => {
    await click(toggle());
    expect(stripPresent()).toBe(false);
    await pressVerb(ROW_A, 'ON PVW');
    expect(await pvw()).toEqual(['item-ind-a']);
    expect(stripPresent()).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    await click(toggle());
    expect(stripPresent()).toBe(true);
    await pressVerb(ROW_A, 'OFF PVW');
    expect(await pvw()).toEqual([]);
    expect(stripPresent()).toBe(true);
  });

  it('hiding and showing the monitors leaves the PVW set exactly as it was', async () => {
    await pressVerb(ROW_A, 'ON PVW');
    await pressVerb(ROW_B, 'ON PVW');
    expect(await pvw()).toEqual(['item-ind-a', 'item-ind-b']);

    await click(toggle());
    expect(stripPresent()).toBe(false);
    expect(await pvw()).toEqual(['item-ind-a', 'item-ind-b']);
    // …and the rows still say so with the strip gone.
    expect(row(ROW_A).querySelector('button[aria-label="OFF PVW"]')).not.toBeNull();

    await click(toggle());
    expect(stripPresent()).toBe(true);
    expect(await pvw()).toEqual(['item-ind-a', 'item-ind-b']);
  });
});

describe('the flag itself', () => {
  it('is session state: hiding the monitors writes nothing new into the persisted shell layout', async () => {
    await click(toggle());
    expect(stripPresent()).toBe(false);
    // Nothing is written for the flag at all (Phase 5: no persisted key or shape change).
    expect(storage.getItem('cg.runtime.shell-layout.v1')).toBeNull();
    // …and the instrument is live: a fullscreen press IS persisted, in the old shape.
    await click(document.querySelector('button[aria-label="Show LAYERS fullscreen"]'));
    const raw = storage.getItem('cg.runtime.shell-layout.v1');
    expect(raw).not.toBeNull();
    expect(Object.keys(JSON.parse(raw ?? '{}') as object).sort()).toEqual([
      'focus',
      'inspectorPx',
      'monitorPx',
    ]);
  });
});
