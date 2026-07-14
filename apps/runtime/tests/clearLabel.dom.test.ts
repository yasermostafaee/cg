// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackRow } from '../src/renderer/features/stack/StackRow.js';

/**
 * The row's off-air button says CLEAR, because CLEAR is what it sends.
 *
 * It was labelled OUT, which reads like the authored outro — an animated exit. It is not: it
 * dispatches `out()`, which puts `CLEAR <ch>-<layer>` on the wire, a hard cut that destroys
 * the producer. An operator choosing between "OUT" and "REMOVE" had no way to know that the
 * gentle-sounding one was the hard one.
 *
 * This is a LABEL change. The pin that matters is below: the same intent still fires.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const ON_AIR: StackItemState = {
  itemId: 'item-1',
  templateId: 'tpl-1',
  fields: {},
  status: 'on-air',
  pending: false,
};

async function renderRow(onOut: () => Promise<{ accepted: boolean }>): Promise<HTMLDivElement> {
  const stub = { link: { status: () => 'live' as const, onStatusChanged: () => () => undefined } };
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const noop = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(StackRow, {
          item: ON_AIR,
          selected: false,
          dirty: false,
          templateLabel: 'news lower third',
          onSelect: () => undefined,
          onPlay: noop,
          onUpdate: noop,
          onOut,
          onRemove: noop,
        }),
      ),
    );
  });
  return container;
}

function buttonNamed(el: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => b.textContent === text);
}

describe('the off-air button is honest about what it sends', () => {
  it('reads CLEAR, not OUT', async () => {
    const el = await renderRow(() => Promise.resolve({ accepted: true }));

    expect(buttonNamed(el, 'CLEAR')).toBeDefined();
    expect(buttonNamed(el, 'OUT')).toBeUndefined();
  });

  it('still dispatches the SAME out intent — the rename changed nothing on the wire', async () => {
    const onOut = vi.fn(() => Promise.resolve({ accepted: true }));
    const el = await renderRow(onOut);

    await act(async () => {
      buttonNamed(el, 'CLEAR')?.click();
      await Promise.resolve();
    });

    expect(onOut).toHaveBeenCalledTimes(1);
    expect(onOut).toHaveBeenCalledWith('item-1');
  });

  it('keeps CLEAR distinct from REMOVE — clearing air is not dropping the row', async () => {
    const el = await renderRow(() => Promise.resolve({ accepted: true }));

    expect(buttonNamed(el, 'CLEAR')).toBeDefined();
    expect(buttonNamed(el, 'REMOVE')).toBeDefined();
  });
});
