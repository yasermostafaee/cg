// @vitest-environment jsdom
import { StrictMode, createElement, type FunctionComponent, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StationChannels } from '@cg/shared-ipc';
import {
  NO_AIR,
  PLAYLIST_TAGS,
  UNLICENSED_LINE,
  airLabel,
  playlistTag,
  type ChannelAir,
} from '../src/renderer/features/channels/channelAir.js';
import { ChannelStrip } from '../src/renderer/features/channels/ChannelStrip.js';
import { OutputDot } from '../src/renderer/features/channels/OutputDot.js';
import { UnlicensedLine } from '../src/renderer/features/channels/UnlicensedLine.js';
import type { ChannelSignal } from '../src/renderer/features/channels/channelSignals.js';
import { __resetChannelChoiceForTest } from '../src/renderer/features/channels/channelStore.js';
import { MonitorPanel, programHeadTags } from '../src/renderer/features/monitors/MonitorPanel.js';
import type { ProgramReturn } from '../src/renderer/hooks/useProgramReturn.js';
import { signedInStub } from './support/authStub.js';
import { stationSetupStub } from './support/stationSetup.js';
import { SOUND_OFF, stubMeters } from './support/programPane.js';

/**
 * 🔴 `UI-POLISH-01` G — **ON AIR OR NOT, BEFORE EVERY CHANNEL NAME AND ON THE PROGRAM HEAD; THE
 * PLAYLIST IS INFORMATION, NEVER THE COLOUR.**
 *
 * `output` alone decides: a filled dot and a green head while `on-air`, a hollow ring and a neutral
 * head while `off`, nothing and a neutral head with `Output unknown` otherwise. The owner's
 * multi-box case — playlist STOPPED, output ON AIR — keeps the green. `unlicensed` is the one
 * playlist state that is more than information: its line shows in that channel's view only.
 *
 * The COLOUR itself is paint, and is measured in a browser (`e2e/ui-polish.spec.ts`, golden rule
 * 12); here are the structures that carry it and the words.
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
  __resetChannelChoiceForTest();
  vi.restoreAllMocks();
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
  });
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  return container;
}

const air = (output: ChannelAir['output'], playlist: string | null = null): ChannelAir => ({
  output,
  playlist,
});

describe('the words', () => {
  it('the ten playlist values, in the Playout’s order, and the tag each shows', () => {
    expect([...PLAYLIST_TAGS.entries()]).toEqual([
      ['offline', 'Playout offline'],
      ['unlicensed', 'Unlicensed'],
      ['cued', 'Cued'],
      ['stopped', 'Playlist stopped'],
      ['paused', 'Paused'],
      ['hold', 'Hold'],
      ['live', 'Live'],
      ['playing', 'Playing'],
      ['waiting', 'Waiting'],
      ['idle', 'Idle'],
    ]);
  });

  it('a value outside the table is shown as its own word — control: a known one is translated', () => {
    expect(playlistTag('stopped')).toBe('Playlist stopped');
    expect(playlistTag('rehearsal')).toBe('rehearsal');
    // A prototype key is a word like any other, never a function.
    expect(playlistTag('constructor')).toBe('constructor');
  });

  it('the dot’s words: output first, then the playlist’s tag', () => {
    expect(airLabel(air('on-air', 'stopped'))).toBe('On air · Playlist stopped');
    expect(airLabel(air('off'))).toBe('Off air');
    expect(airLabel(air('unknown', 'idle'))).toBe('Output unknown · Idle');
  });
});

describe('the dot', () => {
  it('ON AIR is a filled dot named `On air · …`; OFF is a ring named `Off air`', async () => {
    const el = await mount(
      createElement(
        'div',
        null,
        createElement(OutputDot, { air: air('on-air', 'stopped') }),
        createElement(OutputDot, { air: air('off', 'stopped') }),
      ),
    );
    const dots = [...el.querySelectorAll<HTMLElement>('[data-output-dot]')];
    expect(dots.map((d) => d.dataset.outputDot)).toEqual(['on-air', 'off']);
    expect(dots.map((d) => d.getAttribute('role'))).toEqual(['img', 'img']);
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual([
      'On air · Playlist stopped',
      'Off air · Playlist stopped',
    ]);
    expect(dots.map((d) => d.title)).toEqual([
      'On air · Playlist stopped',
      'Off air · Playlist stopped',
    ]);
  });

  it('UNKNOWN renders nothing at all — never a grey ring — control: the same mount renders an off ring', async () => {
    const el = await mount(
      createElement(
        'div',
        null,
        createElement(OutputDot, { air: NO_AIR }),
        createElement(OutputDot, { air: air('unknown', 'playing') }),
        createElement(OutputDot, { air: air('off') }),
      ),
    );
    expect(
      [...el.querySelectorAll('[data-output-dot]')].map((d) => d.getAttribute('data-output-dot')),
    ).toEqual(['off']);
  });
});

// ── The strip ─────────────────────────────────────────────────────────────────────────────────

const BANKS_ONE_TWO = [
  { channel: 1, low: { start: 50, count: 9 }, start: 70, count: 4 },
  { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 4 },
];

function discovered(
  one: Partial<StationChannels['channels'][number]>,
  two: Partial<StationChannels['channels'][number]>,
): StationChannels {
  return {
    channels: [
      {
        channel: 1,
        named: { id: 'apasai', name: 'آپاسای' },
        declared: true,
        permitted: true,
        sources: ['catalogue', 'bank'],
        ...one,
      },
      {
        channel: 2,
        named: { id: 'cg-test2', name: 'کانال دوم (تست CG)' },
        declared: true,
        permitted: true,
        sources: ['catalogue', 'bank'],
        ...two,
      },
    ],
  };
}

async function renderWith(answer: StationChannels, element: ReactElement): Promise<HTMLElement> {
  stationSetupStub({ banks: BANKS_ONE_TWO, auth: signedInStub('نرگس کریمی', [1, 2]) });
  (
    window as unknown as {
      cg: { stationChannels: { list: () => Promise<StationChannels>; onChanged: unknown } };
    }
  ).cg.stationChannels = {
    list: () => Promise.resolve(answer),
    onChanged: () => () => undefined,
  };
  return mount(element);
}

/** `ChannelStrip`'s props are an optional parameter, which `createElement` cannot infer through. */
const StripWithSignals = ChannelStrip as FunctionComponent<{
  signals?: ReadonlyMap<number, ChannelSignal>;
}>;

const tabs = (el: HTMLElement): HTMLButtonElement[] => [
  ...el.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Channels"] [role="tab"]'),
];

describe('the strip — the dot before the name, the alarm mark after it', () => {
  it('channel 1 on air, channel 2 off: a filled dot and a ring, each BEFORE its name', async () => {
    const el = await renderWith(
      discovered({ output: 'on-air', playlist: 'playing' }, { output: 'off', playlist: 'stopped' }),
      createElement(StripWithSignals, {
        signals: new Map<number, ChannelSignal>([[2, 'warning']]),
      }),
    );
    const [one, two] = tabs(el);
    expect(one?.querySelector('[data-output-dot]')?.getAttribute('data-output-dot')).toBe('on-air');
    expect(two?.querySelector('[data-output-dot]')?.getAttribute('data-output-dot')).toBe('off');
    // ORDER: dot, then the name, then (on channel 2) the amber mark — both read at once.
    const order = (tab: HTMLElement | undefined): string[] =>
      [...(tab?.querySelectorAll('[data-output-dot], bdi, [data-tab-signal]') ?? [])].map((n) =>
        n.hasAttribute('data-output-dot') ? 'dot' : n.tagName === 'BDI' ? 'name' : 'mark',
      );
    expect(order(one)).toEqual(['dot', 'name']);
    expect(order(two)).toEqual(['dot', 'name', 'mark']);
    // The name's text is untouched by the dot — the dot carries its words as an image's name.
    expect(two?.textContent?.startsWith('کانال دوم (تست CG)')).toBe(true);
  });

  it('no output — unknown, absent, a Playout we cannot read — gives NO dot; control: a sibling tab with one has it', async () => {
    const el = await renderWith(
      discovered({ output: 'on-air' }, {}),
      createElement(ChannelStrip, null),
    );
    const [one, two] = tabs(el);
    expect(
      one?.querySelector('[data-output-dot]'),
      'CONTROL — the instrument sees a dot',
    ).not.toBeNull();
    expect(two?.querySelector('[data-output-dot]')).toBeNull();
  });

  it('only the playlist differs: the dot is the same shape — the playlist is in the words, not the colour', async () => {
    const stopped = await renderWith(
      discovered({ output: 'on-air', playlist: 'stopped' }, {}),
      createElement(ChannelStrip, null),
    );
    const dotStopped = tabs(stopped)[0]?.querySelector('[data-output-dot]');
    expect(dotStopped?.getAttribute('data-output-dot')).toBe('on-air');
    expect(dotStopped?.getAttribute('aria-label')).toBe('On air · Playlist stopped');
  });
});

// ── The PROGRAM head ──────────────────────────────────────────────────────────────────────────

const NO_RETURN: ProgramReturn = { src: null, signal: 'none', onError: () => undefined };

function head(value: ChannelAir): ReactElement {
  stubMeters();
  return createElement(MonitorPanel, {
    id: 'pgm',
    title: 'PROGRAM (PGM)',
    word: 'PROGRAM',
    channel: 1,
    onAirRows: 0,
    programReturn: NO_RETURN,
    programSound: SOUND_OFF,
    air: value,
  });
}

describe('the PROGRAM head follows `output`; the playlist is a neutral tag', () => {
  it('the owner’s multi-box case: ON AIR with the playlist STOPPED keeps the on-air head, with a `Playlist stopped` tag', async () => {
    const el = await mount(head(air('on-air', 'stopped')));
    expect(el.querySelector('.cg-monitor-label--pgm')?.getAttribute('data-output')).toBe('on-air');
    expect(
      [...el.querySelectorAll('[data-testid="monitor-head-tag"]')].map((t) => t.textContent),
    ).toEqual(['Playlist stopped']);
    // The return-feed words are untouched, beside both.
    expect(el.textContent).toContain('No return signal');
  });

  it('OFF: the head says off (neutral) — control: the tags carry no `Output unknown`', async () => {
    const el = await mount(head(air('off', 'playing')));
    expect(el.querySelector('.cg-monitor-label--pgm')?.getAttribute('data-output')).toBe('off');
    expect(
      [...el.querySelectorAll('[data-testid="monitor-head-tag"]')].map((t) => t.textContent),
    ).toEqual(['Playing']);
  });

  it('UNKNOWN: a neutral head with an `Output unknown` tag', async () => {
    const el = await mount(head(NO_AIR));
    expect(el.querySelector('.cg-monitor-label--pgm')?.getAttribute('data-output')).toBe('unknown');
    expect(
      [...el.querySelectorAll('[data-testid="monitor-head-tag"]')].map((t) => t.textContent),
    ).toEqual(['Output unknown']);
  });

  it('the head’s tags, as words', () => {
    expect(programHeadTags(air('on-air', 'stopped'))).toEqual(['Playlist stopped']);
    expect(programHeadTags(air('unknown', 'unlicensed'))).toEqual(['Output unknown', 'Unlicensed']);
    expect(programHeadTags(air('off', 'rehearsal'))).toEqual(['rehearsal']);
    expect(programHeadTags(air('on-air'))).toEqual([]);
  });
});

// ── Unlicensed ────────────────────────────────────────────────────────────────────────────────

describe('`unlicensed` — the one line, in that channel’s view only', () => {
  const answer = discovered(
    { output: 'off', playlist: 'unlicensed' },
    { output: 'on-air', playlist: 'playing' },
  );

  it('the view of channel 1 carries the line', async () => {
    const el = await renderWith(answer, createElement(UnlicensedLine, { scope: 1 }));
    expect(el.querySelector('[data-unlicensed-line]')?.textContent).toContain(UNLICENSED_LINE);
  });

  it('the view of channel 2 does not — control: the same answer, channel 1’s view, did', async () => {
    const el = await renderWith(answer, createElement(UnlicensedLine, { scope: 2 }));
    expect(el.querySelector('[data-unlicensed-line]')).toBeNull();
  });

  it('a station with one channel (no scope) shows it', async () => {
    const el = await renderWith(answer, createElement(UnlicensedLine, { scope: null }));
    expect(el.querySelector('[data-unlicensed-line]')?.getAttribute('data-unlicensed-line')).toBe(
      '1',
    );
  });
});
