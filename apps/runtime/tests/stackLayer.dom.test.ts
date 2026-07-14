// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackRow } from '../src/renderer/features/stack/StackRow.js';

/** The layer wording on the real row — "no layer" when idle, the real number when on air. */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const noop = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });

const BASE: StackItemState = {
  itemId: 'item-1',
  templateId: 'tpl-1',
  fields: {},
  status: 'idle',
  pending: false,
};

async function renderRow(item: StackItemState): Promise<HTMLDivElement> {
  const stub = { link: { status: () => 'live' as const, onStatusChanged: () => () => undefined } };
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(StackRow, {
          item,
          selected: false,
          dirty: false,
          templateLabel: 'news lower third',
          onSelect: () => undefined,
          onPlay: noop,
          onUpdate: noop,
          onOut: noop,
          onRemove: noop,
        }),
      ),
    );
  });
  return container;
}

describe('the stack row speaks in layers, not slots', () => {
  it('an item with no layer says so plainly', async () => {
    const el = await renderRow(BASE);

    expect(el.textContent).toContain('no layer');
    expect(el.textContent).not.toContain('no slot');
  });

  it('an on-air item shows the real layer it occupies', async () => {
    const el = await renderRow({
      ...BASE,
      status: 'on-air',
      slot: { channel: 1, layer: 61, server: 'primary' },
    });

    expect(el.textContent).toContain('layer 61');
    // Not the internal "slot 1-61" coordinate.
    expect(el.textContent).not.toContain('slot');
  });
});
