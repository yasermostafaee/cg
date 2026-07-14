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

/**
 * R-006 — the row now also mirrors the bridge's connection refusal, so it needs a link
 * status. `live` is the default here: these cases pin the ITEM-status gating (B-053).
 */
function stubLink(status: 'live' | 'disconnected' | 'offline-mock'): void {
  const stub = { link: { status: () => status, onStatusChanged: () => () => undefined } };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

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

async function renderRow(
  status: StackItemState['status'],
  link: 'live' | 'disconnected' | 'offline-mock' = 'live',
): Promise<Map<string, boolean>> {
  stubLink(link);
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

  it('DISCONNECTED: the on-air verbs are all disabled, whatever the item status (R-006)', async () => {
    // The operator is not invited to issue a command that cannot reach CasparCG. The bridge
    // refuses it regardless (it stays authoritative); this stops the click from LOOKING like
    // it did something — which is how a false ON AIR belief starts.
    const loaded = await renderRow('loaded', 'disconnected');
    expect(loaded.get('PLAY')).toBe(true);
    expect(loaded.get('UPDATE')).toBe(true);
    expect(loaded.get('OUT')).toBe(true);
    // REMOVE is local bookkeeping, not a wire command — it stays available.
    expect(loaded.get('REMOVE')).toBe(false);

    const onAir = await renderRow('on-air', 'disconnected');
    expect(onAir.get('PLAY')).toBe(true);
    expect(onAir.get('UPDATE')).toBe(true);
    expect(onAir.get('OUT')).toBe(true);
  });

  it('TEST MODE: the verbs stay enabled — simulating them is the point (R-006)', async () => {
    // Test mode is an explicit simulation, and the loud TEST MODE banner makes it
    // impossible to mistake for air. Gating it would make the mock unable to exercise the
    // very on-air surfaces it exists to test.
    const buttons = await renderRow('loaded', 'offline-mock');
    expect(buttons.get('PLAY')).toBe(false);
  });

  it('an on-air item: PLAY disabled, UPDATE and OUT enabled', async () => {
    const buttons = await renderRow('on-air');
    expect(buttons.get('PLAY')).toBe(true);
    expect(buttons.get('UPDATE')).toBe(false);
    expect(buttons.get('OUT')).toBe(false);
    expect(buttons.get('REMOVE')).toBe(false);
  });
});
