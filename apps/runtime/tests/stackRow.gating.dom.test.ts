// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackRow } from '../src/renderer/features/stack/StackRow.js';

/**
 * B-053 — the button-gating half of the false-ON-AIR bug. StackRow computes
 * `onAir = status === 'on-air' || 'playing'`; pre-fix, a merely-loaded item's
 * false `on-air` DISABLED PLAY (the operator could not take the item they just
 * loaded) and wrongly enabled UPDATE/OUT. This pins the gating per status so
 * the reconciler fix's operator-visible contract stays asserted.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

function itemWith(status: StackItemState['status']): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: { title: 'عنوان' },
    status,
    pending: false,
  };
}

const noop = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });

async function renderRow(status: StackItemState['status']): Promise<Map<string, boolean>> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(StackRow, {
          item: itemWith(status),
          selected: false,
          dirty: false,
          onSelect: () => undefined,
          onPlay: noop,
          onUpdate: noop,
          onOut: noop,
          onRemove: noop,
        }),
      ),
    );
  });
  const buttons = new Map<string, boolean>();
  for (const btn of container.querySelectorAll('button')) {
    buttons.set(btn.textContent ?? '', btn.disabled);
  }
  await act(async () => {
    root.unmount();
  });
  return buttons;
}

describe('StackRow gating (B-053 contract)', () => {
  it('a loaded (READY, never-taken) item: PLAY enabled, UPDATE and OUT disabled', async () => {
    const buttons = await renderRow('loaded');
    expect(buttons.get('PLAY')).toBe(false);
    expect(buttons.get('UPDATE')).toBe(true);
    expect(buttons.get('OUT')).toBe(true);
    expect(buttons.get('REMOVE')).toBe(false);
  });

  it('an on-air item: PLAY disabled, UPDATE and OUT enabled', async () => {
    const buttons = await renderRow('on-air');
    expect(buttons.get('PLAY')).toBe(true);
    expect(buttons.get('UPDATE')).toBe(false);
    expect(buttons.get('OUT')).toBe(false);
    expect(buttons.get('REMOVE')).toBe(false);
  });
});
