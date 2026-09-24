// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogueChannel, ChannelOccupancy } from '@cg/shared-ipc';
import { ChannelStep } from '../src/renderer/features/firstRun/FirstRunScreen.js';
import { fillBridgeStub, setupStub } from './support/authStub.js';

/**
 * 🔴 `DESKTOP-APPS-01-D` a / d — **FIRST-RUN'S CHANNEL CHOICE.**
 *
 * a — the owner picked channel 1, the Playout's programme channel, himself: nothing chose it for
 *     him, and nothing may. No row is preselected, each row names the channel AND its number, and
 *     only an explicit click declares.
 * d — a channel already on air with somebody else's content (`1-5`, the Playout's video) earns
 *     ONE line and a second press before it is declared; a warning, never a block. An empty
 *     channel earns nothing.
 */

const ROWS: CatalogueChannel[] = [
  { id: 'apasai', name: 'آپاسای', casparHost: '127.0.0.1', casparChannel: 1 },
  { id: 'cg', name: 'کانال دوم (تست CG)', casparHost: '127.0.0.1', casparChannel: 2 },
];

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
  vi.restoreAllMocks();
});

function stub(occupancy: (channel: number) => ChannelOccupancy): void {
  (window as unknown as { cg: unknown }).cg = fillBridgeStub({
    setup: {
      ...setupStub(),
      catalogue: () => Promise.resolve({ rows: ROWS }),
      routeAddress: () => Promise.resolve({ address: '127.0.0.1' }),
      channelOccupancy: (req: { casparChannel: number }) =>
        Promise.resolve(occupancy(req.casparChannel)),
    },
  });
}

async function render(): Promise<{
  el: HTMLDivElement;
  prepare: ReturnType<typeof vi.fn>;
  declare: ReturnType<typeof vi.fn>;
  done: ReturnType<typeof vi.fn>;
}> {
  const prepare = vi.fn(() => Promise.resolve(null));
  const declare = vi.fn(() => Promise.resolve(null));
  const done = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(ChannelStep, { playoutHost: '127.0.0.1', onDone: done, prepare, declare }),
      ),
    );
  });
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  return { el: container, prepare, declare, done };
}

const rowButton = (el: HTMLElement, channel: number): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>(`button[data-channel="${String(channel)}"]`);
const useButton = (el: HTMLElement): HTMLButtonElement | undefined =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    /^Use (this channel|these \d+ channels)/.test(b.textContent ?? ''),
  );

async function press(button: HTMLButtonElement | null | undefined): Promise<void> {
  expect(button, 'the button exists').toBeTruthy();
  await act(async () => {
    button?.click();
  });
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe('a — first-run never picks a channel for the admin', () => {
  it('no row is preselected, each names the channel AND its number, and nothing can be declared yet', async () => {
    stub(() => ({ state: 'empty', layers: [] }));
    const { el, declare } = await render();
    for (const row of ROWS) {
      const button = rowButton(el, row.casparChannel);
      expect(button?.getAttribute('aria-pressed')).toBe('false');
      expect(button?.textContent).toContain(row.name);
      expect(button?.textContent).toContain(`CH ${String(row.casparChannel)}`);
    }
    expect(useButton(el)?.disabled).toBe(true);
    await press(useButton(el));
    expect(declare).not.toHaveBeenCalled();
  });

  it('control — an explicit click declares that channel, and only that one', async () => {
    stub(() => ({ state: 'empty', layers: [] }));
    const { el, declare, done } = await render();
    await press(rowButton(el, 2));
    expect(rowButton(el, 2)?.getAttribute('aria-pressed')).toBe('true');
    expect(rowButton(el, 1)?.getAttribute('aria-pressed')).toBe('false');
    await press(useButton(el));
    expect(declare).toHaveBeenCalledTimes(1);
    // `MULTI-CHANNEL-01` §2 E — the step declares a SET; here it holds the one channel clicked.
    expect(declare.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ channel: 2, casparHost: '127.0.0.1' }),
    ]);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('E — first-run picks ONE OR MORE channels (`MULTI-CHANNEL-01` §2 E)', () => {
  it('two clicks pick two channels, and one press declares both', async () => {
    stub(() => ({ state: 'empty', layers: [] }));
    const { el, declare, done } = await render();
    await press(rowButton(el, 1));
    await press(rowButton(el, 2));
    expect(rowButton(el, 1)?.getAttribute('aria-pressed')).toBe('true');
    expect(rowButton(el, 2)?.getAttribute('aria-pressed')).toBe('true');
    expect(useButton(el)?.textContent).toBe('Use these 2 channels');
    await press(useButton(el));
    expect(declare.mock.calls).toEqual([
      [
        [
          expect.objectContaining({ channel: 1, casparHost: '127.0.0.1' }),
          expect.objectContaining({ channel: 2, casparHost: '127.0.0.1' }),
        ],
      ],
    ]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('a second click takes a channel back out — the control for "each click adds"', async () => {
    stub(() => ({ state: 'empty', layers: [] }));
    const { el, declare } = await render();
    await press(rowButton(el, 1));
    await press(rowButton(el, 2));
    await press(rowButton(el, 1));
    expect(rowButton(el, 1)?.getAttribute('aria-pressed')).toBe('false');
    expect(useButton(el)?.textContent).toBe('Use this channel');
    await press(useButton(el));
    expect(declare.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ channel: 2 })]);
  });

  it('the set is on ONE CasparCG host: a row on another host starts the set again there', async () => {
    const TWO_HOSTS: CatalogueChannel[] = [
      ...ROWS,
      { id: 'news', name: 'خبر', casparHost: '10.0.0.9', casparChannel: 1 },
    ];
    (window as unknown as { cg: unknown }).cg = fillBridgeStub({
      setup: {
        ...setupStub(),
        catalogue: () => Promise.resolve({ rows: TWO_HOSTS }),
        routeAddress: () => Promise.resolve({ address: '127.0.0.1' }),
        channelOccupancy: () => Promise.resolve({ state: 'empty', layers: [] }),
      },
    });
    const { el, declare } = await render();
    await press(rowButton(el, 2));
    const other = el.querySelector<HTMLButtonElement>(
      '[data-caspar-host="10.0.0.9"] button[data-channel="1"]',
    );
    await press(other);
    expect(other?.getAttribute('aria-pressed')).toBe('true');
    expect(rowButton(el, 2)?.getAttribute('aria-pressed'), 'the first host’s pick left').toBe(
      'false',
    );
    await press(useButton(el));
    expect(declare.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ channel: 1, casparHost: '10.0.0.9' }),
    ]);
  });
});

describe('d — a channel already on air is declared only after one line and a second press', () => {
  const programme = (channel: number): ChannelOccupancy =>
    channel === 1
      ? { state: 'occupied', layers: [{ layer: 5, producer: 'ffmpeg' }] }
      : { state: 'empty', layers: [] };

  it('picking the programme channel warns once — its name, its number, the layer — and declares only on the second press', async () => {
    stub(programme);
    const { el, prepare, declare } = await render();
    await press(rowButton(el, 1));
    await press(useButton(el));
    // The connection is in force (the reading needs it); the channel is NOT declared yet.
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(declare).not.toHaveBeenCalled();
    const warning = el.querySelector('[data-channel-on-air]');
    expect(warning?.textContent).toBe(
      'آپاسای · CH 1 is already on air — another system is playing on layer 5.',
    );
    // The name is isolated (golden rule 11) — the line stays LTR chrome.
    expect(warning?.querySelector('bdi')?.textContent).toBe('آپاسای');
    expect(useButton(el)?.textContent).toBe('Use this channel anyway');
    // Not a block: the second press declares it.
    await press(useButton(el));
    expect(declare).toHaveBeenCalledTimes(1);
    expect(declare.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ channel: 1 })]);
  });

  it('`MULTI-CHANNEL-01` — two picked, one on air: ONE line, about that channel alone', async () => {
    stub(programme);
    const { el, declare } = await render();
    await press(rowButton(el, 1));
    await press(rowButton(el, 2));
    await press(useButton(el));
    const lines = [...el.querySelectorAll('[data-channel-on-air]')];
    expect(lines.map((l) => l.getAttribute('data-channel-on-air'))).toEqual(['1']);
    expect(declare).not.toHaveBeenCalled();
    expect(useButton(el)?.textContent).toBe('Use these 2 channels anyway');
    await press(useButton(el));
    expect(declare).toHaveBeenCalledTimes(1);
  });

  it('control — an EMPTY channel gets no warning and is declared on the first press', async () => {
    stub(programme);
    const { el, declare } = await render();
    await press(rowButton(el, 2));
    await press(useButton(el));
    expect(el.querySelector('[data-channel-on-air]')).toBeNull();
    expect(declare).toHaveBeenCalledTimes(1);
  });

  it('changing the choice withdraws the warning — it was about the programme channel', async () => {
    stub(programme);
    const { el } = await render();
    await press(rowButton(el, 1));
    await press(useButton(el));
    expect(el.querySelector('[data-channel-on-air]')).not.toBeNull();
    // `MULTI-CHANNEL-01` — each row is a toggle: the programme channel out, channel 2 in.
    await press(rowButton(el, 1));
    await press(rowButton(el, 2));
    expect(el.querySelector('[data-channel-on-air]')).toBeNull();
    expect(useButton(el)?.textContent).toBe('Use this channel');
  });
});
