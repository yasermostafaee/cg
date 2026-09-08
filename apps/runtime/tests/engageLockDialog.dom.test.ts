// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { EngageLockDialog, MIN_LOCK_PIN } from '../src/renderer/features/lock/EngageLockDialog.js';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 9 — deletion guard item 16, the engage-lock dialog.
 *
 * Before Phase 9 this surface rode on `numericInput.dom.test.ts`, whose subject is digit
 * normalisation: it reached the dialog only as the road to `lock.engage`. Phase 1 asked for a
 * presence-and-confirmation assertion in its own right, and the plant pass showed why — the
 * mismatch refusal and the status-bar door each reddened only through that one digit file.
 *
 * The contract (`STATION-CHROME-01` §7): the operator is about to disable his own console, so
 * the PIN is asked TWICE and the lock is REFUSED unless the two match; a PIN shorter than the
 * floor the bridge shares is refused; the advisory says, before it happens, that the lock
 * refuses everything including Clear and Stop and that the PIN is not stored. Nothing here is
 * discoverable afterwards, which is why it is asserted as what the dialog SHOWS.
 */

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
  document.body.innerHTML = '';
});

async function mount(): Promise<{
  onEngage: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
}> {
  const onEngage = vi.fn();
  const onCancel = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(StrictMode, null, createElement(EngageLockDialog, { onEngage, onCancel })),
    );
  });
  return { onEngage, onCancel };
}

// The dialog is PORTALLED to `document.body`, so everything is queried on the document.
const fields = (): HTMLInputElement[] => [
  ...document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
];

async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(): Promise<void> {
  const lock = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Lock');
  expect(lock, 'the dialog has no Lock control').not.toBeUndefined();
  await act(async () => {
    lock?.click();
    await Promise.resolve();
  });
}

describe('guard item 16 — the engage-lock dialog is present, asks twice, and refuses a mismatch', () => {
  it('opens with TWO PIN fields and the advisory the operator must read before locking', async () => {
    await mount();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog, 'the dialog did not render').not.toBeNull();
    expect(dialog?.textContent).toContain('Engage lock');
    expect(fields(), 'the PIN is asked twice, on purpose').toHaveLength(2);
    expect(dialog?.textContent).toContain('refuses everything, including Clear and Stop');
    expect(dialog?.textContent).toContain('The PIN is not stored');
    expect(dialog?.textContent).toContain('The way out is to unlock');
  });

  it('🔴 two DIFFERENT PINs are refused with the sentence, and nothing is engaged', async () => {
    const { onEngage } = await mount();
    const [one, two] = fields();
    await type(one as HTMLInputElement, '1234');
    await type(two as HTMLInputElement, '1235');
    await submit();
    expect(onEngage).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('The two PINs are different');
  });

  it('a PIN below the shared floor is refused, naming the floor', async () => {
    const { onEngage } = await mount();
    const short = '1'.repeat(MIN_LOCK_PIN - 1);
    const [one, two] = fields();
    await type(one as HTMLInputElement, short);
    await type(two as HTMLInputElement, short);
    await submit();
    expect(onEngage).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(`at least ${String(MIN_LOCK_PIN)} characters`);
  });

  it('two MATCHING PINs engage, once, with the confirmed PIN', async () => {
    const { onEngage } = await mount();
    const [one, two] = fields();
    await type(one as HTMLInputElement, '2468');
    await type(two as HTMLInputElement, '2468');
    await submit();
    expect(onEngage).toHaveBeenCalledTimes(1);
    expect(onEngage).toHaveBeenCalledWith('2468');
  });

  it('🔴 THE DOOR — the status bar’s Lock… opens this dialog (the plant that wired it shut reddened only the digit suite)', async () => {
    const health: ConnectionHealth = {
      primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
      currentPrimary: 'A',
      strategy: 'mirror-sync',
    };
    const stub = {
      connections: {
        health: () => Promise.resolve(health),
        onHealthChanged: () => () => undefined,
        failover: () => Promise.resolve({ ok: false, newPrimary: 'A' as const }),
      },
      lock: {
        state: () => Promise.resolve({ engaged: false }),
        onStateChanged: () => () => undefined,
        engage: vi.fn(() => Promise.resolve({ ok: true })),
      },
      link: {
        status: () => 'live' as const,
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(createElement(StrictMode, null, createElement(StatusBar)));
    });
    expect(document.querySelector('[role="dialog"]'), 'no dialog before the press').toBeNull();
    const lockButton = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Lock…'),
    );
    expect(lockButton, 'the bar has no Lock… control').not.toBeUndefined();
    await act(async () => {
      lockButton?.click();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog, 'Lock… did not open the engage dialog').not.toBeNull();
    expect(dialog?.textContent).toContain('Engage lock');
    expect(fields()).toHaveLength(2);
  });

  it('Cancel is a way out of ENGAGING (not of the lock): it calls onCancel and engages nothing', async () => {
    const { onEngage, onCancel } = await mount();
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel');
    expect(cancel).not.toBeUndefined();
    await act(async () => {
      cancel?.click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEngage).not.toHaveBeenCalled();
  });
});
