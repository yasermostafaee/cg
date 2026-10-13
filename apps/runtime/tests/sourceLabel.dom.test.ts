// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SourceCatalog } from '@cg/shared-ipc';
import type { TakeRefusal } from '@cg/shared-schema';
import {
  CommandText,
  commandForDisplay,
  producerForDisplay,
  sourceInCommand,
} from '../src/renderer/features/sources/producerDisplay.js';
import { SourceLabel, formatMediaDuration } from '../src/renderer/features/sources/SourceLabel.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { plateLabelOf, takeRefusalLine } from '../src/renderer/features/layers/takeRefusalLine.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.B / §1.C / §1.E — **ONE WAY TO NAME A BOUND SOURCE; NO ADDRESS EVER
 * SHOWN; AND THE ROW'S LINE FOR AN ENTRY THE PLAYOUT STOPPED OFFERING.**
 */

const CATALOG: SourceCatalog = {
  sources: [
    {
      id: 'in-newscam',
      name: 'دوربین خبر',
      origin: 'input',
      producer: { kind: 'stream', url: 'rtsp://***@10.0.0.21/live' },
    },
    {
      id: 'in-studio5',
      name: 'Studio 5',
      origin: 'input',
      producer: { kind: 'ndi', source: 'OLD (Cam)' },
      status: 'unavailable',
      departed: true,
      reason: "Not in the Playout's input list.",
    },
    {
      id: 'md-m-t20',
      name: 'تیتراژ خبر ۲۰',
      origin: 'media',
      producer: { kind: 'media', file: 'C:/Apasai CIaB/News/t20.mov' },
      media: { durationMs: 1_059_000, lastBoundAt: '2026-09-27T08:00:00.000Z' },
    },
  ],
};

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(async () => {
  __resetSourcesForTest();
  initSources({
    sources: {
      config: () => Promise.resolve(CATALOG),
      assignments: () => Promise.resolve({ assignments: [] }),
      onConfigChanged: () => () => undefined,
      onAssignmentsChanged: () => () => undefined,
    },
  } as never);
  await act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  __resetSourcesForTest();
});

async function mount(node: ReturnType<typeof createElement>): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(node);
    await Promise.resolve();
  });
  return host;
}

describe('§2.B — SourceLabel', () => {
  it('an input: its icon and its NAME, isolated — never its address or its id', async () => {
    const el = await mount(createElement(SourceLabel, { sourceId: 'in-newscam' }));
    expect(el.querySelector('[data-source-label="input"] bdi')?.textContent).toBe('دوربین خبر');
    expect(el.querySelector('.lucide-cable')).not.toBeNull();
    expect(el.textContent).not.toMatch(/rtsp|in-newscam/);
  });

  it('a media item: the media icon, the name and its length', async () => {
    const el = await mount(createElement(SourceLabel, { sourceId: 'md-m-t20' }));
    expect(el.querySelector('.lucide-film')).not.toBeNull();
    expect(el.textContent).toContain('تیتراژ خبر ۲۰');
    expect(el.querySelector('.cg-source-label__meta')?.textContent).toBe('17:39');
  });

  it('an entry the Playout stopped offering wears `Unavailable`, with the reason on hover', async () => {
    const el = await mount(createElement(SourceLabel, { sourceId: 'in-studio5' }));
    const tag = el.querySelector('.cg-source-tag--unavailable');
    expect(tag?.textContent).toBe('Unavailable');
    expect(tag?.getAttribute('title')).toBe("Not in the Playout's input list.");
  });

  it('an empty or unknown binding reads as its fallback — never as the id', async () => {
    const el = await mount(
      createElement(SourceLabel, { sourceId: 'src-handmade-gone', fallback: 'None' }),
    );
    expect(el.textContent).toBe('None');
  });

  it('formats a clip’s length as a playout list writes it', () => {
    expect(formatMediaDuration(1_059_000)).toBe('17:39');
    expect(formatMediaDuration(3_725_000)).toBe('1:02:05');
    expect(formatMediaDuration(9_000)).toBe('0:09');
  });
});

describe('§1.E — a stream’s address is never shown in the console', () => {
  it('a ledger producer that is a stream reads `stream`; anything else is left as it is', () => {
    expect(producerForDisplay('"rtsp://***@10.0.0.21/live"')).toBe('stream');
    expect(producerForDisplay('"udp://239.255.0.1:5000?reuse=1"')).toBe('stream');
    // Control: route, NDI, DeckLink and a clip are not addresses of anything outside the server.
    expect(producerForDisplay('"route://1-2"')).toBe('"route://1-2"');
    expect(producerForDisplay('[NDI] "STUDIO-PC (Cam 1)"')).toBe('[NDI] "STUDIO-PC (Cam 1)"');
    expect(producerForDisplay('DECKLINK DEVICE 1')).toBe('DECKLINK DEVICE 1');
  });

  it('a refused PLAY hides its stream; a CG ADD keeps its page URL (the bridge’s own)', () => {
    expect(commandForDisplay('PLAY 2-60 "rtsp://***@10.0.0.21/live"')).toBe('PLAY 2-60 "stream"');
    const add = 'CG 1-58 ADD 0 "http://127.0.0.1:64373/template/x" 0 "…"';
    expect(commandForDisplay(add)).toBe(add);
  });

  it('the audit line names a refused command’s source by `SourceLabel` when the catalogue knows it', async () => {
    expect(sourceInCommand('PLAY 2-60 "rtsp://***@10.0.0.21/live"', CATALOG)?.source.id).toBe(
      'in-newscam',
    );
    const el = await mount(
      createElement(CommandText, {
        command: 'PLAY 2-60 "rtsp://***@10.0.0.21/live"',
        catalog: CATALOG,
      }),
    );
    expect(el.textContent).toBe('PLAY 2-60 دوربین خبر');
    expect(el.textContent).not.toContain('rtsp');
  });
});

describe('§1.C — the row’s line for an entry the Playout stopped offering', () => {
  const refusal = (over: Partial<TakeRefusal>): TakeRefusal => ({
    code: 'source-unavailable',
    plateId: 'guest-1',
    sourceId: 'in-studio5',
    sourceName: 'Studio 5',
    sourceOrigin: 'input',
    ...over,
  });

  it("🔴 an input: `Bed 59 · Plate 1: “Studio 5” is not in the Playout's input list.`", () => {
    const line = takeRefusalLine('Bed 59', refusal({}), {
      plateLabel: 'Plate 1',
      entry: CATALOG.sources[1],
    });
    expect(line.text).toBe("Bed 59 · Plate 1: “Studio 5” is not in the Playout's input list.");
  });

  it('🔴 a media item: `Bed 59 · Plate 2: “تیتراژ خبر ۲۰” is not available in the Playout right now.`', () => {
    const line = takeRefusalLine(
      'Bed 59',
      refusal({
        plateId: 'guest-2',
        sourceId: 'md-m-t20',
        sourceName: 'تیتراژ خبر ۲۰',
        sourceOrigin: 'media',
      }),
      { plateLabel: 'Plate 2' },
    );
    expect(line.text).toBe(
      'Bed 59 · Plate 2: “تیتراژ خبر ۲۰” is not available in the Playout right now.',
    );
    expect(line.unseatable).toEqual({
      plate: 'Plate 2',
      name: 'تیتراژ خبر ۲۰',
      rest: ' is not available in the Playout right now.',
    });
  });

  it('`Plate N` is the plate’s position in its template — the id stays off the line', () => {
    const template = {
      templateId: 't',
      templateType: 'lower-third',
      fields: [],
      liveSources: {
        resolution: { width: 1920, height: 1080 },
        defaultPosition: { anchor: 'center' as const, offset: { x: 0, y: 0 } },
        sources: [
          {
            elementId: 'a',
            sourceId: 'guest-1',
            rect: { x: 0, y: 0, width: 1, height: 1 },
            dynamic: false,
          },
          {
            elementId: 'b',
            sourceId: 'guest-2',
            rect: { x: 0, y: 0, width: 1, height: 1 },
            dynamic: false,
          },
        ],
      },
    };
    expect(plateLabelOf(template, 'guest-2')).toBe('Plate 2');
    expect(plateLabelOf(template, 'guest-9')).toBeUndefined();
  });

  it('control: a server refusal keeps its own line, naming the source', () => {
    const line = takeRefusalLine('Bed 59', {
      code: 'amcp-403',
      command: 'PLAY 2-60 DECKLINK DEVICE 1',
      plateId: 'guest-1',
      sourceId: 'in-sdi',
      sourceName: 'studio1',
    });
    expect(line.text).toBe(
      'Bed 59 · studio1 (DeckLink 1): the server has no such input, or it is in use.',
    );
    expect(line.unseatable).toBeUndefined();
  });
});
