// @vitest-environment jsdom
import { createElement, Profiler, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PgmMeterReading } from '@cg/shared-ipc';
import { NO_AIR } from '../src/renderer/features/channels/channelAir.js';
import { MonitorPanel } from '../src/renderer/features/monitors/MonitorPanel.js';
import { usePgmAudio } from '../src/renderer/hooks/usePgmAudio.js';
import type { ProgramReturn } from '../src/renderer/hooks/useProgramReturn.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAM PANE'S METER, BADGE AND SPEAKER, WIRED.** The readings
 * land on the bars' `clip-path` and the badge's text with NO React commit per reading; the channel on screen
 * is the only one drawn; the speaker is off by default, remembered per console, and asks CG Bridge for the
 * sound only once it is on and the browser has let the sound start.
 *
 * What a bar LOOKS like (the gradient, the segments, the two-bar fallback) is paint, and is measured in a
 * real engine (`programme-sound.spec.ts`); here only the attribute and style values the code writes.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NO_RETURN: ProgramReturn = { src: null, signal: 'none', onError: () => undefined };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let emit: (reading: PgmMeterReading) => void = () => undefined;
let audioUrl = vi.fn((_channel: number) => Promise.resolve<string | null>(null));

/** A stand-in `AudioContext`: suspended until `resume`, as a browser keeps one until a gesture. */
class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  onstatechange: (() => void) | null = null;
  currentTime = 0;
  destination = {};
  resume(): Promise<void> {
    this.state = 'running';
    this.onstatechange?.();
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

beforeEach(() => {
  // The suite's jsdom has no storage of its own: one stands in, so `remembered` is read back for real.
  installMemoryStorage();
  audioUrl = vi.fn((_channel: number) => Promise.resolve<string | null>(null));
  (window as unknown as { cg: unknown }).cg = {
    link: { status: () => 'live', onStatusChanged: () => () => undefined },
    meters: {
      onReading: (handler: (reading: PgmMeterReading) => void) => {
        emit = handler;
        return () => {
          emit = () => undefined;
        };
      },
    },
    pgmReturn: { audioUrl },
  };
});

afterEach(async () => {
  const r = root;
  root = null;
  if (r !== null) {
    await act(async () => {
      r.unmount();
    });
  }
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

function Pane({ channel }: { channel: number }): ReactElement {
  const sound = usePgmAudio(channel);
  return createElement(MonitorPanel, {
    id: 'pgm',
    title: 'PROGRAM (PGM)',
    word: 'PROGRAM',
    channel,
    onAirRows: 0,
    programReturn: NO_RETURN,
    programSound: sound,
    air: NO_AIR,
  });
}

async function mount(channel = 1): Promise<{ commits: () => number }> {
  let commits = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(
      createElement(
        Profiler,
        {
          id: 'pgm',
          onRender: () => {
            commits++;
          },
        },
        createElement(Pane, { channel }),
      ),
    );
  });
  return { commits: () => commits };
}

const bars = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.cg-vu__fill')];
const badge = (): HTMLElement => document.querySelector('[data-loudness-badge]') as HTMLElement;
const speaker = (): HTMLButtonElement =>
  document.querySelector('[aria-label="Programme sound"]') as HTMLButtonElement;

describe('the programme meter and the loudness badge', () => {
  it('🔴 readings land on the bars and the badge with NO React commit per reading; only the channel on screen', async () => {
    const { commits } = await mount(1);
    // Eight bars, at the floor until a reading arrives; the badge says it knows nothing.
    expect(bars()).toHaveLength(8);
    expect(bars().every((b) => b.style.clipPath === 'inset(100.00% 0 0 0)')).toBe(true);
    expect(badge().textContent).toBe('— LUFS');
    expect(badge().dataset['loudnessTone']).toBe('unknown');

    const before = commits();
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        emit({ kind: 'audio', channel: 1, dbfs: [-18, -7.2, 0, -60, -30, -30, -30, -30, -12] });
        emit({
          kind: 'loudness',
          channel: 1,
          momentary: -22,
          shortterm: -23.14,
          limiterGrDb: -0.5,
        });
      }
    });
    expect(commits(), 'eighty readings, and not one render').toBe(before);
    expect(bars().map((b) => b.style.clipPath)).toEqual([
      'inset(30.00% 0 0 0)',
      'inset(12.00% 0 0 0)',
      'inset(0.00% 0 0 0)',
      'inset(100.00% 0 0 0)',
      'inset(50.00% 0 0 0)',
      'inset(50.00% 0 0 0)',
      'inset(50.00% 0 0 0)',
      'inset(50.00% 0 0 0)',
    ]);
    expect(badge().textContent).toBe('−23.1 LUFS');
    expect(badge().dataset['loudnessTone']).toBe('on-target');
    expect(badge().hasAttribute('data-limiting')).toBe(true);

    // Another channel's reading draws nothing here.
    await act(async () => {
      emit({ kind: 'audio', channel: 2, dbfs: [0, 0, 0, 0, 0, 0, 0, 0] });
      emit({ kind: 'loudness', channel: 2, momentary: null, shortterm: -40, limiterGrDb: 0 });
    });
    expect(bars()[0]?.style.clipPath).toBe('inset(30.00% 0 0 0)');
    expect(badge().textContent).toBe('−23.1 LUFS');
  });
});

describe('the programme speaker — off by default, per console, remembered', () => {
  it('🔴 off by default and asks for nothing; pressed, it is remembered and asks CG Bridge for THIS channel’s sound', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    // The stream itself never answers here: what is under test is WHO is asked, and when.
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
    await mount(2);
    expect(speaker().getAttribute('aria-pressed')).toBe('false');
    expect(speaker().getAttribute('data-pgm-audio')).toBe('off');
    expect(speaker().hasAttribute('data-toggle-on')).toBe(false);
    expect(audioUrl).not.toHaveBeenCalled();
    expect(localStorage.getItem('cg.runtime.pgm-audio.v1')).toBeNull();

    await act(async () => {
      speaker().click();
    });
    expect(speaker().getAttribute('aria-pressed')).toBe('true');
    expect(speaker().hasAttribute('data-toggle-on')).toBe(true);
    expect(localStorage.getItem('cg.runtime.pgm-audio.v1')).toBe('{"on":true}');
    await vi.waitFor(() => {
      expect(audioUrl).toHaveBeenCalledWith(2);
    });
    expect(speaker().getAttribute('data-pgm-audio')).toBe('connecting');

    // Off again: remembered off.
    await act(async () => {
      speaker().click();
    });
    expect(speaker().getAttribute('data-pgm-audio')).toBe('off');
    expect(localStorage.getItem('cg.runtime.pgm-audio.v1')).toBe('{"on":false}');
  });

  it('remembered ON after a reload waits for the first press anywhere — the browser’s rule — and then plays', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
    localStorage.setItem('cg.runtime.pgm-audio.v1', '{"on":true}');
    await mount(1);
    expect(speaker().getAttribute('aria-pressed')).toBe('true');
    expect(speaker().getAttribute('data-pgm-audio')).toBe('waiting');
    expect(audioUrl).not.toHaveBeenCalled();

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    await vi.waitFor(() => {
      expect(audioUrl).toHaveBeenCalledWith(1);
    });
  });

  it('an unreadable remembered value reads as OFF', async () => {
    localStorage.setItem('cg.runtime.pgm-audio.v1', '{not json');
    await mount(1);
    expect(speaker().getAttribute('aria-pressed')).toBe('false');
  });
});
