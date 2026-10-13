// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { RowErrorsBadge } from '../src/renderer/features/layers/RowErrorsBadge.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `B-301` (`CONSOLE-POLISH-01` §2) — **THE BADGE COUNTS ROWS IN ERROR, LISTS THEM, DISMISSES EACH.**
 * The owner's station read `2 in error` and never cleared: two layerless leftovers of refused Loads,
 * counted on every channel. It counts rows now (in `error`, ON A LAYER), absent with none; pressed,
 * it lists them by the operator's name and layer with the reason in words, each with Dismiss.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  vi.restoreAllMocks();
});

const row = (itemId: string, over: Partial<StackItemState> = {}): StackItemState => ({
  itemId,
  templateId: 'tpl',
  fields: {},
  status: 'error',
  pending: false,
  errorCode: 'amcp-403',
  slot: { channel: 1, layer: 59, server: 'primary' },
  ...over,
});

async function render(items: readonly StackItemState[]): Promise<{
  el: HTMLElement;
  dismiss: ReturnType<typeof vi.fn>;
}> {
  const dismiss = vi.fn(() => Promise.resolve({ accepted: true }));
  (window as unknown as { cg: unknown }).cg = { stack: { dismissError: dismiss } };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(RowErrorsBadge, {
          items,
          nameOf: (item: StackItemState) => ({
            names: [item.itemId === 'bed' ? 'Bed 59' : 'Layer 90', '2ghab'],
            layer: item.slot === undefined ? null : `1-${String(item.slot.layer)}`,
            title: item.itemId,
          }),
        }),
      ),
    );
  });
  return { el: container, dismiss };
}

describe('B-301 — the Layers badge', () => {
  it('🔴 counts ROWS in error only: a layerless leftover is not counted, and a loaded row is not', async () => {
    const { el } = await render([
      row('bed'),
      row('leftover', { slot: undefined }),
      row('fine', { status: 'loaded', errorCode: undefined }),
    ]);
    const badge = el.querySelector<HTMLButtonElement>('[data-layers-tally-error]');
    expect(badge?.textContent).toBe('1 in error');
    expect(badge?.getAttribute('data-error-tally')).toBe('1');
    expect(badge?.tagName).toBe('BUTTON');
  });

  it('CONTROL — with no row in error the badge is absent', async () => {
    const { el } = await render([row('leftover', { slot: undefined })]);
    expect(el.querySelector('[data-layers-tally-error]')).toBeNull();
  });

  it('pressed, it lists each row by its name and LAYER with the reason in words — and Dismiss asks the bridge for THAT row', async () => {
    const { el, dismiss } = await render([
      row('bed', {
        takeRefusal: { code: 'amcp-403', command: 'CG 1-59 PLAY 0' },
      }),
    ]);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-layers-tally-error]')?.click();
    });
    const list = document.querySelector('[data-row-errors]');
    expect(list).not.toBeNull();
    const entry = list?.querySelector('[data-row-error="bed"]');
    expect(entry?.textContent).toContain('Bed 59');
    // Golden rule 11 — the real coordinate stays where a row is named in a sentence.
    expect(entry?.textContent).toContain('1-59');
    const why = entry?.querySelector('[data-row-error-why]')?.textContent ?? '';
    expect(why.length).toBeGreaterThan(0);
    expect(why).not.toContain('amcp-403');
    await act(async () => {
      entry?.querySelector<HTMLButtonElement>('[data-row-error-dismiss]')?.click();
      await Promise.resolve();
    });
    expect(dismiss).toHaveBeenCalledWith({ itemId: 'bed' });
  });
});
