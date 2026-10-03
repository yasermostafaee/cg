// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOT_A_BRIDGE_ADDRESS, NOT_A_PLAYOUT_ADDRESS } from '@cg/shared-ipc';
import {
  PlayoutAddressGate,
  type GateStation,
} from '../src/renderer/features/firstRun/PlayoutAddressGate.js';
import { loadStationAddress, saveStationAddress } from '../src/platform/stationAddress.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 C (D8) — **CG CONTROL'S FIRST QUESTION: WHERE IS THE PLAYOUT?**
 *
 * A fresh CG Control has nowhere to connect: it finds CG Bridge on the Playout's host, port 5280 —
 * or, on a separate server, where it is told. So it asks that — labels, two fields, one action,
 * one refusal line — saves the answer as this console's station record, and starts again. The same
 * gate in a real engine, dialling nothing, is `e2e/playout-address-gate.spec.ts`.
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
  delete (globalThis as { localStorage?: unknown }).localStorage;
  vi.restoreAllMocks();
});

async function render(
  save: (station: GateStation) => boolean,
  reload: () => void,
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(PlayoutAddressGate, { save, reload })));
  });
  return container;
}

const input = (c: HTMLElement, id: string): HTMLInputElement =>
  c.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
const connect = (c: HTMLElement): HTMLButtonElement =>
  [...c.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Connect',
  ) as HTMLButtonElement;
const status = (c: HTMLElement): string => c.querySelector('[role="status"]')?.textContent ?? '';

/** Type as React sees typing: the native value setter, then the event React listens to. */
async function type(field: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function press(c: HTMLElement): Promise<void> {
  await act(async () => {
    connect(c).click();
  });
}

describe('CENTRAL-BRIDGE-01 — the Playout-address gate', () => {
  it('asks where the Playout is — and, only if it is elsewhere, CG Bridge: two labelled fields, one action', async () => {
    const c = await render(
      () => true,
      () => undefined,
    );
    expect(c.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Set up CG Control',
    );
    expect([...c.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'Playout address',
      'CG Bridge address',
    ]);
    expect(c.querySelectorAll('input')).toHaveLength(2);
    expect(c.querySelectorAll('button')).toHaveLength(1);
    // Addresses are not prose: left-to-right, whatever the page's direction.
    expect(input(c, 'cg-playout-address').getAttribute('dir')).toBe('ltr');
    expect(input(c, 'cg-bridge-address').getAttribute('dir')).toBe('ltr');
    // Connect waits for the Playout address; the CG Bridge address is optional.
    expect(connect(c).disabled).toBe(true);
    await type(input(c, 'cg-playout-address'), '192.0.2.20');
    expect(connect(c).disabled).toBe(false);
  });

  it('🔴 R-080 — the CG Bridge field says it may stay empty: `Found automatically`, and ONE hint line', async () => {
    const c = await render(
      () => true,
      () => undefined,
    );
    const bridge = input(c, 'cg-bridge-address');
    expect(bridge.value).toBe('');
    expect(bridge.getAttribute('placeholder')).toBe('Found automatically');
    const hint = c.querySelector('[data-bridge-address-hint]');
    expect(hint?.textContent).toBe('Leave empty unless CG Bridge runs on a separate server.');
    // The hint describes the field it sits under, and is the only hint on the form.
    expect(bridge.getAttribute('aria-describedby')?.split(' ')).toContain(hint?.id);
    expect(c.querySelectorAll('[data-bridge-address-hint]')).toHaveLength(1);
    // Control: the Playout field carries no placeholder and no hint — it must be typed.
    expect(input(c, 'cg-playout-address').getAttribute('placeholder')).toBeNull();
  });

  it('🔴 Connect saves the Playout address, normalised — CG Bridge on its host — and starts the console again', async () => {
    const save = vi.fn(() => true);
    const reload = vi.fn();
    const c = await render(save, reload);
    await type(input(c, 'cg-playout-address'), '192.0.2.20');
    await press(c);
    expect(save).toHaveBeenCalledWith({ playoutAddress: 'http://192.0.2.20:8080' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(status(c)).toBe('');
  });

  it('a separate server: the CG Bridge address is saved beside the Playout’s — host, or host:port', async () => {
    for (const [typed, saved] of [
      ['192.0.2.30', '192.0.2.30'],
      [' 192.0.2.30:5281 ', '192.0.2.30:5281'],
    ] as const) {
      const save = vi.fn(() => true);
      const c = await render(save, () => undefined);
      await type(input(c, 'cg-playout-address'), '192.0.2.20');
      await type(input(c, 'cg-bridge-address'), typed);
      await press(c);
      expect(save).toHaveBeenCalledWith({
        playoutAddress: 'http://192.0.2.20:8080',
        bridgeAddress: saved,
      });
      const r = root as Root;
      await act(async () => {
        r.unmount();
      });
      root = null;
      container?.remove();
    }
  });

  it('through the real station record: what is saved is what the console reads back', async () => {
    installMemoryStorage();
    const reload = vi.fn();
    const c = await render(saveStationAddress, reload);
    await type(input(c, 'cg-playout-address'), 'http://192.0.2.20:8081/');
    await type(input(c, 'cg-bridge-address'), '192.0.2.30');
    await press(c);
    expect(loadStationAddress()).toEqual({
      playoutAddress: 'http://192.0.2.20:8081',
      bridgeAddress: '192.0.2.30',
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('Enter in a field is Connect', async () => {
    const save = vi.fn(() => true);
    const c = await render(save, () => undefined);
    await type(input(c, 'cg-playout-address'), '192.0.2.20');
    await act(async () => {
      input(c, 'cg-playout-address').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('CONTROL — an address that is not a Playout’s, or a CG Bridge’s, is refused in one line: nothing saved, no restart', async () => {
    for (const [playout, bridge, refusal] of [
      ['ftp://192.0.2.20', '', NOT_A_PLAYOUT_ADDRESS],
      ['192.0.2.20', 'http://192.0.2.30/', NOT_A_BRIDGE_ADDRESS],
      ['192.0.2.20', '192.0.2.30:99999', NOT_A_BRIDGE_ADDRESS],
    ] as const) {
      const save = vi.fn(() => true);
      const reload = vi.fn();
      const c = await render(save, reload);
      await type(input(c, 'cg-playout-address'), playout);
      if (bridge !== '') await type(input(c, 'cg-bridge-address'), bridge);
      await press(c);
      expect(status(c), `${playout} / ${bridge}`).toBe(refusal);
      expect(save).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      // Typing clears the line (a CHANGE: React reports no change for the same value).
      await type(input(c, 'cg-playout-address'), '192.0.2.21');
      expect(status(c)).toBe('');
      const r = root as Root;
      await act(async () => {
        r.unmount();
      });
      root = null;
      container?.remove();
    }
  });

  it('a store that refuses the write says so, and does not restart into the same question', async () => {
    const reload = vi.fn();
    const c = await render(() => false, reload);
    await type(input(c, 'cg-playout-address'), '192.0.2.20');
    await press(c);
    expect(status(c)).toBe('This console could not save the Playout address.');
    expect(reload).not.toHaveBeenCalled();
  });
});
