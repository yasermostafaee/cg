// @vitest-environment jsdom
import { StrictMode, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { ServerSettingsPanel } from '../src/renderer/features/connections/ServerSettingsPanel.js';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { PositionPicker } from '../src/renderer/features/inspector/PositionPicker.js';
import {
  __resetDraftsForTest,
  effectiveValue,
} from '../src/renderer/features/inspector/draftStore.js';
import { LockOverlay } from '../src/renderer/features/lock/LockOverlay.js';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';
import { NumericInput, normalizeDigits } from '../src/renderer/ui/NumericInput.js';
import { connectionsStub, linkFor } from './support/reachability.js';

/**
 * R-020 — Persian-keyboard digits accepted in numeric inputs, normalized to
 * canonical (Latin) digits.
 *
 * The primitive (`NumericInput`) is deliberately `type="text"`: a browser
 * `type="number"` input silently DROPS Persian/Arabic-Indic digits before
 * `onChange` fires, so there would be nothing to normalize. These tests pin
 * both the primitive and every routed site: what the operator types in ۰–۹ or
 * ٠–٩ is what the store/wire sees in 0–9 — while TEXT fields keep their
 * content verbatim (display text is display text).
 */

let container: HTMLDivElement | null = null;

beforeEach(() => {
  __resetDraftsForTest();
});

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, element));
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container;
}

/** Simulate typing/pasting: both fire `input` with the input's full value. */
async function setInput(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function inputByLabel(el: HTMLElement, ariaLabel: string): HTMLInputElement {
  const input = el.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (input === null) throw new Error(`input ${ariaLabel} not rendered`);
  return input;
}

describe('normalizeDigits — R-020', () => {
  it('maps all ten Persian digits to Latin', () => {
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('maps all ten Arabic-Indic digits to Latin', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('preserves every non-digit character verbatim', () => {
    expect(normalizeDigits('پورت ۵۲۵۰ (osc: ٦٢٥٠)')).toBe('پورت 5250 (osc: 6250)');
    expect(normalizeDigits('-۴۰')).toBe('-40');
  });

  it('٫ (Persian decimal separator, U+066B) → "." only in decimal mode', () => {
    expect(normalizeDigits('۱۲٫۵', { decimal: true })).toBe('12.5');
    // Integer-only inputs keep ٫ untouched — downstream validation rejects it
    // honestly instead of silently inventing a decimal point.
    expect(normalizeDigits('۱۲٫۵')).toBe('12٫5');
  });
});

/** A minimal controlled harness — what every call site does. */
function Harness({
  onValue,
  decimal,
}: {
  onValue: (v: string) => void;
  decimal?: boolean;
}): JSX.Element {
  const [value, setValue] = useState('');
  return createElement(NumericInput, {
    value,
    ...(decimal === true ? { decimal } : {}),
    onValueChange: (next: string) => {
      setValue(next);
      onValue(next);
    },
    'aria-label': 'num',
  });
}

describe('NumericInput — R-020', () => {
  it('is a text input with a numeric input-mode (number inputs drop Persian digits)', async () => {
    const el = await render(createElement(Harness, { onValue: () => undefined }));
    const input = inputByLabel(el, 'num');
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('numeric');
  });

  it('decimal mode advertises a decimal input-mode', async () => {
    const el = await render(createElement(Harness, { onValue: () => undefined, decimal: true }));
    expect(inputByLabel(el, 'num').inputMode).toBe('decimal');
  });

  it('typed Persian digits commit as Latin — displayed AND delivered', async () => {
    const seen: string[] = [];
    const el = await render(createElement(Harness, { onValue: (v) => seen.push(v) }));
    const input = inputByLabel(el, 'num');
    await setInput(input, '۱۲۸');
    expect(input.value).toBe('128');
    expect(seen.at(-1)).toBe('128');
  });

  it('a pasted Arabic-Indic value normalizes the same way (paste fires the same event)', async () => {
    const seen: string[] = [];
    const el = await render(createElement(Harness, { onValue: (v) => seen.push(v) }));
    const input = inputByLabel(el, 'num');
    await setInput(input, '٥٢٥٠');
    expect(input.value).toBe('5250');
    expect(seen.at(-1)).toBe('5250');
  });

  it('decimal mode: ۱۲٫۵ commits as 12.5', async () => {
    const seen: string[] = [];
    const el = await render(
      createElement(Harness, { onValue: (v) => seen.push(v), decimal: true }),
    );
    const input = inputByLabel(el, 'num');
    await setInput(input, '۱۲٫۵');
    expect(input.value).toBe('12.5');
    expect(seen.at(-1)).toBe('12.5');
  });
});

describe('Inspector fields — R-020', () => {
  function stubInspectorBridge(): void {
    const stub = {
      // §0a — BOTH hops, selected by name (support/reachability.ts). `link` is
      // needed too: the health snapshot rides `useBridgeSnapshot`, which reads it.
      link: { status: () => linkFor('both-up'), onStatusChanged: () => () => undefined },
      connections: connectionsStub('both-up'),
      templates: {
        get: vi.fn(() =>
          Promise.resolve({
            templateId: 'tpl-1',
            name: 'Lower third',
            templateType: 'lower-third',
            fields: [
              { id: 'fontSize', type: 'number', label: 'Font size', default: 5, step: 1 },
              { id: 'title', type: 'text', label: 'Headline', default: '' },
            ],
          }),
        ),
      },
      stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
  }

  function item(): StackItemState {
    return {
      itemId: 'item-1',
      templateId: 'tpl-1',
      fields: { fontSize: 5, title: '' },
      status: 'loaded',
      pending: false,
    };
  }

  async function renderInspector(): Promise<HTMLDivElement> {
    stubInspectorBridge();
    return render(
      createElement(Inspector, {
        item: item(),
        onApply: () => Promise.resolve({ accepted: true }),
        onDiscard: () => undefined,
      }),
    );
  }

  it('a NUMBER field typed in Persian stages the canonical number', async () => {
    const el = await renderInspector();
    await setInput(inputByLabel(el, 'fontSize'), '۱۲۸');
    // Stored value: the NUMBER 128 — not a Persian-digit string.
    expect(effectiveValue('item-1', ['fontSize'], undefined)).toBe(128);
    expect(inputByLabel(el, 'fontSize').value).toBe('128');
  });

  it('a TEXT field keeps Persian digits verbatim — display text is display text', async () => {
    const el = await renderInspector();
    await setInput(inputByLabel(el, 'title'), 'کانال ۳');
    expect(effectiveValue('item-1', ['title'], undefined)).toBe('کانال ۳');
    expect(inputByLabel(el, 'title').value).toBe('کانال ۳');
  });
});

describe('PositionPicker offsets — R-020', () => {
  it('Persian-typed offsets apply as canonical numbers on the wire', async () => {
    const setPosition = vi.fn(() => Promise.resolve({ ok: true }));
    const stub = { stack: { setPosition } };
    (window as unknown as { cg: typeof stub }).cg = stub;
    const el = await render(
      createElement(PositionPicker, {
        item: {
          itemId: 'item-1',
          templateId: 'tpl-pos',
          fields: {},
          status: 'loaded',
          pending: false,
        },
      }),
    );
    await setInput(inputByLabel(el, 'Position offset X'), '-۴۰');
    await setInput(inputByLabel(el, 'Position offset Y'), '٧');
    expect(inputByLabel(el, 'Position offset X').value).toBe('-40');
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Apply position"]')?.click();
      await Promise.resolve();
    });
    expect(setPosition).toHaveBeenCalledWith({
      itemId: 'item-1',
      position: { anchor: 'center', offset: { x: -40, y: 7 } },
    });
  });
});

describe('ServerSettingsPanel ports — R-020 (B-077 interaction)', () => {
  function stubBridge(): { setConfig: Mock } {
    const setConfig = vi.fn(() => Promise.resolve({ ok: true }));
    const stub = {
      connections: {
        config: () =>
          Promise.resolve({
            servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
            strategy: 'mirror-sync' as const,
            autoFailoverEnabled: true,
          }),
        onConfigChanged: () => () => undefined,
        setConfig,
      },
      stack: {
        snapshot: () => Promise.resolve([]),
        onStateChanged: () => () => undefined,
      },
      link: { status: () => 'live' as const, onStatusChanged: () => () => undefined },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
    return { setConfig };
  }

  it('a Persian-typed port passes the numeric validation and submits canonical', async () => {
    const { setConfig } = stubBridge();
    const el = await render(
      createElement(ServerSettingsPanel, { open: true, onClose: () => undefined }),
    );
    await setInput(inputByLabel(el, 'Primary AMCP port'), '۵۲۵۱');
    // The /^\d+$/ port rule sees Latin digits — no "must be an integer" refusal.
    expect(el.textContent).not.toContain('AMCP port must be an integer');
    expect(inputByLabel(el, 'Primary AMCP port').value).toBe('5251');
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Apply server settings"]')?.click();
      await Promise.resolve();
    });
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: { A: { host: '127.0.0.1', amcpPort: 5251, oscPort: 6250 } },
      }),
    );
  });
});

describe('Lock PIN — R-020 (both ends of the comparison normalize)', () => {
  it('a Persian-typed release PIN reaches onRelease in Latin', async () => {
    const onRelease = vi.fn(() => Promise.resolve({ ok: true }));
    const el = await render(createElement(LockOverlay, { engaged: true, onRelease }));
    const pinInput = inputByLabel(el, 'PIN');
    await setInput(pinInput, '۱۲۳۴');
    await act(async () => {
      pinInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
    });
    expect(onRelease).toHaveBeenCalledWith('1234');
  });

  it('non-digit PIN characters pass through verbatim', async () => {
    const onRelease = vi.fn(() => Promise.resolve({ ok: true }));
    const el = await render(createElement(LockOverlay, { engaged: true, onRelease }));
    const pinInput = inputByLabel(el, 'PIN');
    await setInput(pinInput, 'رمز۴۲x');
    await act(async () => {
      pinInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
    });
    expect(onRelease).toHaveBeenCalledWith('رمز42x');
  });

  it('a Persian-typed engage PIN is stored in Latin (StatusBar → lock.engage)', async () => {
    const engage = vi.fn(() => Promise.resolve({ ok: true }));
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
        engage,
      },
      link: { status: () => 'live' as const, onStatusChanged: () => () => undefined },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
    const el = await render(createElement(StatusBar));

    // Open the lock prompt, type a Persian PIN, submit. The prompt dialog is
    // PORTALLED to document.body, so it is queried on the document, not `el`.
    const lockButton = [...el.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Lock…'),
    );
    await act(async () => {
      lockButton?.click();
    });
    const pinInput = document.querySelector<HTMLInputElement>('input[type="password"]');
    if (pinInput === null) throw new Error('lock prompt input not rendered');
    await setInput(pinInput, '۱۲۳۴');
    const submit = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Lock');
    await act(async () => {
      submit?.click();
      await Promise.resolve();
    });
    expect(engage).toHaveBeenCalledWith({ pin: '1234' });
  });
});
