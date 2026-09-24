// @vitest-environment jsdom
import { StrictMode, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, LiveLayerState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LiveSourcesPanel } from '../src/renderer/features/layers/LiveSourcesPanel.js';
import { EveryChannelPanic } from '../src/renderer/features/layers/EveryChannelPanic.js';
import type { PanicReport } from '../src/renderer/features/layers/panicReport.js';
import { liveLayerRows, ownerLabelFor } from '../src/renderer/features/layers/liveLayerRows.js';
import {
  __resetChannelChoiceForTest,
  selectChannel,
} from '../src/renderer/features/channels/channelStore.js';
import {
  onCommandError,
  onCommandSuccess,
} from '../src/renderer/features/status/commandFeedback.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';
import { authStub, fillBridgeStub, signedInStub } from './support/authStub.js';
import { connectionsStub } from './support/reachability.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 C — **PANIC ON A CHANNEL'S VIEW SILENCES THAT CHANNEL; A SEPARATE,
 * EXPLICIT CONTROL SILENCES EVERY CHANNEL.** The owner's decision, 2026-09-23 (A16's follow-up).
 *
 * A16's label was built to be the thing that changes when multi-channel arrives, and its test
 * moves with it: the ONE-channel case stays pinned exactly as it was in `liveSourcesPanel.dom.test.ts`
 * (the two scopes are one set there), and this file pins the split — the channel's PANIC names its
 * channel on all three carriers, and the every-channel control keeps A16's every-channel name.
 *
 * Every absence names its control in the same describe.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  const r = root;
  if (r !== null) {
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  __resetChannelChoiceForTest();
  vi.restoreAllMocks();
});

const bankOn = (channel: number): FixedLayerBank => ({
  channel,
  start: 80,
  count: 20,
  low: { start: 50, count: 10 },
});

const REPORT: PanicReport = {
  ok: true,
  silenced: 2,
  recorded: 2,
  rows: [{ itemId: 'item-a', plates: 2 }],
  failed: [],
};

const NOTHING: PanicReport = { ok: false, silenced: 0, recorded: 0, rows: [], failed: [] };

const item = (itemId: string): StackItemState =>
  ({
    itemId,
    templateId: 'tpl-news',
    fields: {},
    status: 'on-air',
    pending: false,
  }) as StackItemState;

const plate = (channel: number): LiveLayerState => ({
  channel,
  layer: 60,
  itemId: 'item-a',
  sourceId: 'guest-1',
  role: 'fill',
  producer: `route://${String(channel)}-1`,
  held: false,
  unverified: false,
});

/** A bridge declaring `banks`, signed in as `auth`, with both PANIC doors as spies. */
function stubBridge(
  banks: FixedLayerBank[],
  auth: AuthSessionState = { kind: 'off' },
): {
  silenceAllLivePlates: ReturnType<typeof vi.fn>;
  silenceChannelLivePlates: ReturnType<typeof vi.fn>;
} {
  const silenceAllLivePlates = vi.fn(() => Promise.resolve(REPORT));
  const silenceChannelLivePlates = vi.fn((_req: { channel: number }) => Promise.resolve(REPORT));
  const stub = {
    link: {
      status: () => 'live',
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    auth: authStub(auth),
    fixedLayers: {
      config: () => Promise.resolve(banks[0] ?? null),
      onConfigChanged: () => () => undefined,
      banks: () => Promise.resolve(banks),
      onBanksChanged: () => () => undefined,
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },
    stack: { silenceAllLivePlates, silenceChannelLivePlates, remove: vi.fn() },
    liveLayers: {
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
      onPlateReleased: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
  return { silenceAllLivePlates, silenceChannelLivePlates };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  container = host;
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(createElement(StrictMode, null, node));
    await flush();
  });
  await act(flush);
  return host;
}

/** The plates tab with one seated plate on `channel`, whose PANIC calls `onPanic`. */
function panel(
  channel: number,
  panicChannel: number | null,
  onPanic: () => Promise<PanicReport> = () => Promise.resolve(REPORT),
): ReactElement {
  return createElement(LiveSourcesPanel, {
    rows: liveLayerRows(
      [plate(channel)],
      ownerLabelFor([item('item-a')], () => 'IRIB News'),
      null,
    ),
    ledgerReady: true,
    blind: null,
    onSelectOwner: () => undefined,
    onApplyVolumes: () => Promise.resolve({ ok: true, refused: [] }),
    onOpenAudio: () => undefined,
    onPanic,
    panicChannel,
  });
}

const toolbarPanic = (el: HTMLElement): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>('[data-plate-toolbar] [data-plate-panic]');

const everyPanic = (el: HTMLElement): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>('[data-every-channel-panic]');

function captureFeedback(): { errors: string[]; successes: string[]; stop: () => void } {
  const errors: string[] = [];
  const successes: string[] = [];
  const offError = onCommandError((m) => errors.push(m));
  const offSuccess = onCommandSuccess((m) => successes.push(m));
  return {
    errors,
    successes,
    stop: () => {
      offError();
      offSuccess();
    },
  };
}

async function press(button: HTMLButtonElement | null): Promise<void> {
  if (button === null) throw new Error('no button to press');
  await act(async () => {
    button.click();
    await flush();
  });
}

describe('the PANIC on a channel’s view', () => {
  it('🔴 A16 moves with the scope — channel 2’s PANIC names channel 2 on all three carriers', async () => {
    stubBridge([bankOn(1), bankOn(2)]);
    selectChannel(2);
    const el = await mount(panel(2, 2));
    const button = toolbarPanic(el);
    expect(button, 'the toolbar carries the PANIC at all').not.toBeNull();
    expect(button?.textContent).toBe('Silence all plates · CH 2');
    expect(button?.getAttribute('aria-label')).toMatch(/^Silence all boxes on channel 2 /);
    expect(button?.getAttribute('title')).toMatch(/seated on channel 2 to zero/);
    expect(button?.getAttribute('title')).toMatch(/No other channel is touched/);
    // …and no carrier claims the other scope.
    for (const carrier of [
      button?.textContent,
      button?.getAttribute('aria-label'),
      button?.getAttribute('title'),
    ]) {
      expect(carrier).not.toMatch(/every channel/i);
    }
  });

  it('THE CONTROL — one declared channel: the carriers are exactly A16’s every-channel ones', async () => {
    stubBridge([bankOn(1)]);
    const el = await mount(panel(1, null));
    const button = toolbarPanic(el);
    expect(button?.textContent).toBe('Silence all plates');
    expect(button?.getAttribute('aria-label')).toMatch(/^Silence all boxes on every channel/);
    expect(button?.getAttribute('title')).toMatch(/every channel this bridge drives/i);
    expect(button?.hasAttribute('data-plate-panic-channel')).toBe(false);
  });

  it('pressing it calls the door it was given, and the sentence names the channel', async () => {
    stubBridge([bankOn(1), bankOn(2)]);
    selectChannel(2);
    const onPanic = vi.fn(() => Promise.resolve(REPORT));
    const el = await mount(panel(2, 2, onPanic));
    const fb = captureFeedback();
    await press(toolbarPanic(el));
    fb.stop();
    expect(onPanic).toHaveBeenCalledTimes(1);
    expect(fb.successes).toEqual(['Silenced · 2 plate(s) on 1 row(s) · CH 2']);
    expect(fb.errors).toEqual([]);
  });

  it('THE CONTROL — the one-channel sentence is exactly what it always was', async () => {
    stubBridge([bankOn(1)]);
    const el = await mount(panel(1, null));
    const fb = captureFeedback();
    await press(toolbarPanic(el));
    fb.stop();
    expect(fb.successes).toEqual(['Silenced · 2 plate(s) on 1 row(s)']);
  });

  it('nothing to silence on channel 2 is said about channel 2, and never as a success', async () => {
    stubBridge([bankOn(1), bankOn(2)]);
    selectChannel(2);
    const el = await mount(panel(2, 2, () => Promise.resolve(NOTHING)));
    const fb = captureFeedback();
    await press(toolbarPanic(el));
    fb.stop();
    expect(fb.successes).toEqual([]);
    expect(fb.errors).toEqual([
      'Nothing was sent — channel 2 holds no live plates, so there was nothing to silence.',
    ]);
  });

  it('🔴 ABSENT for a principal who does not hold channel 2 (golden rule 13) — control: present for one who does', async () => {
    stubBridge([bankOn(1), bankOn(2)], signedInStub('نرگس کریمی', [1]));
    selectChannel(2);
    const el = await mount(panel(2, 2));
    expect(el.querySelector('[data-plate-toolbar]'), 'the toolbar itself is there').not.toBeNull();
    expect(toolbarPanic(el), 'the channel’s PANIC is absent, not greyed').toBeNull();

    // THE CONTROL — the same view, for a principal who holds channel 2.
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    stubBridge([bankOn(1), bankOn(2)], signedInStub('نرگس کریمی', [1, 2]));
    const again = await mount(panel(2, 2));
    expect(toolbarPanic(again)).not.toBeNull();
  });
});

describe('the every-channel control, beside the channel strip', () => {
  it('present on a two-channel station, naming EVERY channel on its face and in its name', async () => {
    stubBridge([bankOn(1), bankOn(2)]);
    const el = await mount(createElement(EveryChannelPanic));
    const button = everyPanic(el);
    expect(button, 'the control is there').not.toBeNull();
    expect(button?.textContent).toBe('SILENCE ALL PLATES · EVERY CHANNEL');
    expect(button?.getAttribute('aria-label')).toMatch(/^Silence all boxes on every channel/);
    expect(button?.getAttribute('title')).toMatch(/on EVERY channel this bridge drives/);
  });

  it('ABSENT on a one-channel station — the toolbar’s PANIC already IS this verb (control: above)', async () => {
    stubBridge([bankOn(1)]);
    const el = await mount(createElement(EveryChannelPanic));
    expect(everyPanic(el)).toBeNull();
  });

  it('🔴 it calls the every-channel verb BARE, never the per-channel one, and says so', async () => {
    const doors = stubBridge([bankOn(1), bankOn(2)]);
    const el = await mount(createElement(EveryChannelPanic));
    const fb = captureFeedback();
    await press(everyPanic(el));
    fb.stop();
    expect(doors.silenceAllLivePlates).toHaveBeenCalledTimes(1);
    // No argument at all — the door takes nothing, and nothing narrows it.
    expect(doors.silenceAllLivePlates.mock.calls[0]?.length).toBe(0);
    expect(doors.silenceChannelLivePlates).not.toHaveBeenCalled();
    expect(fb.successes).toEqual(['Silenced · 2 plate(s) on 1 row(s) · every channel']);
  });

  it('🔴 ABSENT for a principal without the operator role — control: an operator sees it', async () => {
    stubBridge([bankOn(1), bankOn(2)], signedInStub('مریم کاظمی', [1, 2], ['viewer']));
    const el = await mount(createElement(EveryChannelPanic));
    expect(everyPanic(el)).toBeNull();

    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    stubBridge([bankOn(1), bankOn(2)], signedInStub('نرگس کریمی', [1]));
    // A principal holding only ONE of the channels still sees it: the verb is unscoped (A16),
    // so the ROLE is the question, exactly as for the one PANIC before it.
    const again = await mount(createElement(EveryChannelPanic));
    expect(everyPanic(again)).not.toBeNull();
  });
});
