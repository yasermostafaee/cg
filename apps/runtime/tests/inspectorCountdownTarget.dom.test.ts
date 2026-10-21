// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isoOfInstant } from '@cg/text-shaping';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import {
  __resetDraftsForTest,
  effectiveValue,
} from '../src/renderer/features/inspector/draftStore.js';
import {
  agoWords,
  clocksToState,
  pastTargetLine,
} from '../src/renderer/features/inspector/CountdownTargetField.js';
import { __resetCalendarChoiceForTest } from '../src/renderer/ui/calendarChoice.js';
import type { AuthCapabilities, RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-C` §2 — **THE OPERATOR SETS A COUNTDOWN'S TARGET IN THE INSPECTOR.**
 *
 * A text field the import marked `countdown` renders the shared date and time control instead of a
 * text box, and stages through the Inspector's ORDINARY path: Update sends `stack.update` with the
 * field's ISO value — the row's normal value update, nothing new (the wire half, that an on-air
 * row's change is exactly one `CG UPDATE` and an idle row's is nothing, is the bridge's
 * `countdown-target-update.integration.test.ts`). A passed target is a FACT under the control in
 * the author's After-zero words, never a refusal; two clocks are stated only when CG Bridge's
 * machine keeps another zone than this console.
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

const LAYER = 84;
const ITEM = 'item-countdown';
const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): string =>
  isoOfInstant(new Date(y, m - 1, d, h, mi, s).getTime());
/** A target that has already passed whenever this runs. */
const PAST = at(2020, 1, 1, 12, 0, 0);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cg: RuntimeBridge;

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

async function boot(bridgeClock?: AuthCapabilities['bridgeClock']): Promise<void> {
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = true;
  installMemoryStorage();
  __resetCalendarChoiceForTest();
  cg = createMockBridge();
  if (bridgeClock !== undefined) {
    const own = cg.auth.capabilities.bind(cg.auth);
    cg.auth.capabilities = (): AuthCapabilities | null => {
      const caps = own();
      return caps === null ? null : { ...caps, bridgeClock };
    };
  }
  window.cg = cg;
  await cg.templates.import({
    template: {
      templateId: 'tpl-countdown',
      name: 'countdown fixture',
      templateType: 'custom',
      fields: [
        {
          id: 'targetTime',
          label: 'Target time',
          type: 'text',
          required: false,
          default: PAST,
          countdown: { target: 'datetime', afterZero: 'count-past' },
        },
        { id: 'headline', label: 'Headline', type: 'text', required: false, default: '' },
      ],
    },
    html: '<!doctype html><html><body>fixture</body></html>',
  });
  const res = await cg.fixedLayers.load({
    channel: 1,
    layer: LAYER,
    itemId: ITEM,
    templateId: 'tpl-countdown',
    fields: { targetTime: PAST, headline: '' },
  });
  expect(res.accepted, 'the row loads').toBe(true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(App));
    await flush();
  });
  await act(flush);
  const body = document.querySelector<HTMLElement>(
    `[data-layer="${String(LAYER)}"] [data-row-body]`,
  );
  if (body === null) throw new Error('no row body to select');
  await act(async () => {
    body.click();
    await flush();
  });
}

beforeEach(() => {
  __resetDraftsForTest();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

const inspector = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>('[aria-label="Inspector"]');
  if (el === null) throw new Error('no Inspector');
  return el;
};
const group = (): HTMLElement | null =>
  inspector().querySelector<HTMLElement>('[role="group"][aria-label="targetTime"]');
/** `RUN-NEXT-VERSION-03` 2.1 — the date is ONE masked input. */
const dateInput = (): HTMLInputElement => {
  const el = group()?.querySelector<HTMLInputElement>('[data-datetime-mask="date"]');
  if (el === null || el === undefined) throw new Error('no date input');
  return el;
};

/** Keys typed into a masked input from `caret`, as an operator types them. */
async function typeAt(el: HTMLInputElement, keys: string, caret: number): Promise<void> {
  await act(async () => {
    el.focus();
    el.setSelectionRange(caret, caret);
    await flush();
  });
  for (const k of keys) {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      await flush();
    });
  }
}

describe('the Inspector renders the date and time control for a countdown target field', () => {
  it('a marked field is the control, an unmarked one stays a text box', async () => {
    await boot();
    expect(group(), 'the countdown field is the shared control').not.toBeNull();
    expect(group()?.getAttribute('data-datetime-input')).toBe('datetime');
    expect(
      inspector().querySelector('input[aria-label="headline"]'),
      'the ordinary text field is untouched',
    ).not.toBeNull();
  });

  it('an edit STAGES the ISO through the ordinary path, and Update sends it as the row’s value update', async () => {
    await boot();
    const update = vi.spyOn(cg.stack, 'update');
    await typeAt(dateInput(), '1499', 0);
    const staged = effectiveValue(ITEM, ['targetTime'], PAST);
    expect(typeof staged).toBe('string');
    expect(staged).not.toBe(PAST);
    expect(Date.parse(String(staged))).toBeGreaterThan(Date.now());
    // Nothing is sent by the edit itself.
    expect(update).not.toHaveBeenCalled();

    const press = document.querySelector<HTMLButtonElement>('[data-inspector-commit]');
    if (press === null) throw new Error('no Update');
    await act(async () => {
      press.click();
      await flush();
    });
    expect(update).toHaveBeenCalledTimes(1);
    const [req] = update.mock.calls[0] ?? [];
    expect(req).toMatchObject({ itemId: ITEM, fields: { targetTime: staged } });
  });
});

describe('the passed-target fact', () => {
  it('a past target says so in the author’s After-zero words — and a future one says nothing', async () => {
    await boot();
    const fact = (): string | null =>
      inspector().querySelector('[data-countdown-past]')?.textContent ?? null;
    expect(fact()).toMatch(/^Target passed .+ ago · counts past zero$/);
    // The Take is never refused for it.
    expect(document.querySelector<HTMLButtonElement>('[data-inspector-commit]')?.disabled).toBe(
      false,
    );
    await typeAt(dateInput(), '1499', 0);
    expect(fact()).toBeNull();
  });

  it('the words: each After zero, and how long ago', () => {
    const now = new Date(2026, 9, 15, 21, 57, 0).getTime();
    const target = at(2026, 10, 15, 21, 45, 0);
    expect(pastTargetLine(target, 'hold', now)).toBe('Target passed 12 min ago · holds at 00:00');
    expect(pastTargetLine(target, 'count-past', now)).toBe(
      'Target passed 12 min ago · counts past zero',
    );
    expect(pastTargetLine(target, 'hide-digits', now)).toBe(
      'Target passed 12 min ago · digits hidden',
    );
    expect(pastTargetLine(target, 'close', now)).toBe(
      'Target passed 12 min ago · will close at once',
    );
    expect(pastTargetLine(target, 'hold', Date.parse(target) - 1)).toBeNull();
    expect(pastTargetLine('21:45', 'hold', now), 'a time of day is never passed').toBeNull();
    expect([agoWords(40_000), agoWords(7_500_000), agoWords(97_200_000)]).toEqual([
      '40 s',
      '2 h 5 min',
      '1 d 3 h',
    ]);
  });
});

describe('two clocks, only when they differ', () => {
  it('CG Bridge in another zone: both clocks stand beside the field as facts', async () => {
    await boot({ timeZone: 'Pacific/Kiritimati', offsetMinutes: 840 });
    const clocks = inspector().querySelector('[data-countdown-clocks]');
    expect(clocks?.querySelector('[data-testid="playout-clock"]')?.textContent).toBe(
      'Playout clockPacific/Kiritimati +14:00',
    );
    expect(clocks?.querySelector('[data-testid="console-clock"]')?.textContent).toContain(
      'This console',
    );
  });

  it('the same clock, or a bridge that says nothing: no clock is stated', async () => {
    await boot();
    expect(inspector().querySelector('[data-countdown-clocks]')).toBeNull();
    const mine = { timeZone: 'Asia/Tehran', offsetMinutes: 210 };
    expect(clocksToState(mine, { ...mine })).toBeNull();
    expect(clocksToState(null, mine)).toBeNull();
    expect(clocksToState(undefined, mine)).toBeNull();
  });
});
