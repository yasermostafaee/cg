// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INPUT_GONE_REASON,
  ROUTE_NO_LAYER_REASON,
  type ConsoleMediaItem,
  type SourceCatalog,
} from '@cg/shared-ipc';
import { SourcePicker, type SourceChoice } from '../src/renderer/features/sources/SourcePicker.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';
import { choosePickerOption, closePicker, openPicker, pickerTab } from './support/sourcePicker.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A — **THE ONE SOURCE PICKER, driven as an operator drives it.**
 *
 * What it must be true of, whichever of its three call sites it sits in: it looks like the select
 * it replaced; it opens an anchored panel with the call site's choices above two tabs; inputs are
 * listed by NAME in the Playout's order, disabled — never hidden — when they cannot be bound or are
 * not on this row's channel; media are searched on the Playout's side, a page at a time, in a list
 * that draws only what is in view; inputs and media never meet; the keyboard reaches everything;
 * and a choice is returned ONCE.
 */

const CATALOG: SourceCatalog = {
  sources: [
    {
      id: 'in-studio1',
      name: 'Studio 1',
      origin: 'input',
      producer: { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
    },
    {
      id: 'in-newscam',
      name: 'دوربین خبر',
      origin: 'input',
      producer: { kind: 'stream', url: 'rtsp://***@10.0.0.21/live' },
    },
    {
      // `ROUTE-PLATES-01` — a Playout route (the gate is gone): bindable, on channels 1 and 2.
      id: 'in-input3',
      name: 'ورودی ۳',
      origin: 'input',
      producer: { kind: 'route', channel: 9, layer: 12 },
      channels: [1, 2],
    },
    {
      // A route with no layer (v1.3 rule 3): listed, unusable, never bindable.
      id: 'in-nolayer',
      name: 'No layer',
      origin: 'input',
      producer: { kind: 'route', channel: 9 },
      status: 'unusable',
      reason: ROUTE_NO_LAYER_REASON,
    },
    {
      id: 'in-ch1only',
      name: 'Channel one only',
      origin: 'input',
      producer: { kind: 'ndi', source: 'X (Y)' },
      channels: [1],
    },
    {
      id: 'in-down',
      name: 'Studio 7',
      origin: 'input',
      producer: { kind: 'ndi', source: 'Z (W)' },
      status: 'unavailable',
      reason: 'no signal',
    },
    {
      // `PLAYOUT-FEATURES-01` B (`B-298`) — an NDI input that is CH 2's own output (D10 `ownOutputOf`).
      id: 'in-own2',
      name: 'خروجی کانال ۲',
      origin: 'input',
      producer: { kind: 'ndi', source: 'APASAI (APASAI-CGTEST2)' },
      ownOutputOf: 2,
    },
    {
      // `PLAYOUT-FEATURES-01` C (`R-075`) — the Playout's playlist output of CH 1, L = 7, on CH 1 and 2.
      id: 'in-pl-apasai',
      name: 'خروجیِ پخش: آپاسای',
      origin: 'input',
      producer: { kind: 'route', channel: 1, layer: 7 },
      channels: [1, 2],
      playlistOf: 1,
    },
    {
      // …and CH 2's, which the Playout marks unavailable (`unlicensed`, in words, by the builder).
      id: 'in-pl-cg',
      name: 'خروجیِ پخش: کانال دوم',
      origin: 'input',
      producer: { kind: 'route', channel: 2, layer: 7 },
      channels: [1, 2],
      playlistOf: 2,
      status: 'unavailable',
      reason: 'Unlicensed in the Playout — it clears that channel every minute.',
    },
    {
      // `B-303` — the owner's input, which the Playout stopped listing (kept as departed): a Persian
      // name that STARTS with a Latin word.
      id: 'in-ndi-apasai',
      name: 'NDI کانالِ ۱ (APASAI)',
      origin: 'input',
      producer: { kind: 'ndi', source: 'MTA (APASAI)' },
      status: 'unavailable',
      departed: true,
      reason: INPUT_GONE_REASON,
    },
    {
      id: 'md-m-recent',
      name: 'تیتراژ خبر ۲۰',
      origin: 'media',
      producer: { kind: 'media', file: 'C:/Apasai CIaB/News/t20.mov' },
      media: { durationMs: 20_000, lastBoundAt: '2026-09-27T08:00:00.000Z', folder: 'News' },
    },
  ],
};

/** The Playout's library, as the fake bridge searches it: a media item named like an input. */
const LIBRARY: ConsoleMediaItem[] = [
  { id: 'md-m-studio1', name: 'Studio 1', durationMs: 12_000, width: 1920, height: 1080 },
  ...Array.from({ length: 119 }, (_, i) => ({
    id: `md-m-${String(i).padStart(4, '0')}`,
    name: `Clip ${String(i).padStart(3, '0')}`,
    durationMs: 1_059_000,
    width: 1920,
    height: 1080,
    folder: 'آرشیو',
  })),
];

let root: Root | null = null;
let host: HTMLElement | null = null;
const searches: { q: string; cursor?: string }[] = [];
let searchDown = false;

function installBridge(): void {
  const bridge = {
    sources: {
      config: () => Promise.resolve(CATALOG),
      assignments: () => Promise.resolve({ assignments: [] }),
      onConfigChanged: () => () => undefined,
      onAssignmentsChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      setAssignments: () => Promise.resolve({ ok: true }),
      refresh: vi.fn(() => Promise.resolve({ ok: true })),
      mediaSearch: vi.fn((req: { q: string; cursor?: string; limit?: number }) => {
        searches.push({ q: req.q, ...(req.cursor !== undefined ? { cursor: req.cursor } : {}) });
        if (searchDown) {
          return Promise.resolve({
            ok: false,
            reason: 'playout-unreachable',
            message: 'The Playout did not answer.',
          });
        }
        const matched = LIBRARY.filter((m) => m.name.toLowerCase().includes(req.q.toLowerCase()));
        const start = req.cursor === undefined ? 0 : Number(req.cursor);
        const limit = req.limit ?? 50;
        return Promise.resolve({
          ok: true,
          items: matched.slice(start, start + limit),
          total: matched.length,
          nextCursor: start + limit < matched.length ? String(start + limit) : null,
        });
      }),
    },
  };
  (window as unknown as { cg: typeof bridge }).cg = bridge;
  initSources(bridge as never);
}

beforeEach(async () => {
  searches.length = 0;
  searchDown = false;
  __resetSourcesForTest();
  installBridge();
  await act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  clearPortals();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

async function render(props: {
  value?: string;
  channel?: number;
  choices?: SourceChoice[];
  onChange?: (value: string) => void;
}): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(
      createElement(SourcePicker, {
        value: props.value ?? '',
        onChange: props.onChange ?? (() => undefined),
        choices: props.choices ?? [{ value: '', label: 'None' }],
        ...(props.channel !== undefined ? { channel: props.channel } : {}),
        'aria-label': 'Source for guest-1',
      }),
    );
    await Promise.resolve();
  });
  const field = host.querySelector<HTMLElement>('[role="combobox"]');
  if (field === null) throw new Error('no picker field');
  return field;
}

const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
};

describe('closed — it is the select it replaced', () => {
  it('shows the call site’s choice for an empty binding, and the source’s NAME for a bound one', async () => {
    const empty = await render({});
    expect(empty.classList.contains('cg-field')).toBe(true);
    expect(empty.textContent).toBe('None');
    expect(empty.getAttribute('aria-expanded')).toBe('false');
    act(() => root?.unmount());
    host?.remove();
    const bound = await render({ value: 'in-newscam' });
    expect(bound.querySelector('[data-source-label="input"] bdi')?.textContent).toBe('دوربین خبر');
    // Never the address, never the id.
    expect(bound.textContent).not.toContain('rtsp');
    expect(bound.textContent).not.toContain('in-newscam');
  });

  it('an unavailable binding wears the amber `Unavailable` tag', async () => {
    const field = await render({ value: 'in-down' });
    expect(field.querySelector('.cg-source-tag--unavailable')?.textContent).toBe('Unavailable');
  });
});

describe('B-303 — a choice names its source APART from its words, in the name’s own direction', () => {
  const DEFAULT = (names: string | null): SourceChoice[] => [
    { value: '', label: 'Default', names },
  ];

  it('🔴 the owner’s default: the name in its own RTL isolate, `Default (` … `)` outside it, and `Unavailable`', async () => {
    const field = await render({ choices: DEFAULT('in-ndi-apasai') });
    const value = field.querySelector('[data-source-label="choice"]');
    expect(value?.textContent).toBe('Default (NDI کانالِ ۱ (APASAI))Unavailable');
    const name = value?.querySelector('[data-choice-name]');
    // The name ALONE is the isolate — the English words are not inside it…
    expect(name?.tagName).toBe('BDI');
    expect(name?.textContent).toBe('NDI کانالِ ۱ (APASAI)');
    // …and it is laid out right to left, though it starts with `N` (dir=auto would say LTR).
    expect(name?.getAttribute('dir')).toBe('rtl');
    const tag = value?.querySelector('.cg-source-tag--unavailable');
    expect(tag?.textContent).toBe('Unavailable');
    expect(tag?.getAttribute('title')).toBe(INPUT_GONE_REASON);

    // The same choice inside the panel.
    await openPicker(field);
    const option = document.querySelector('[data-picker-choice=""] [data-choice-name]');
    expect(option?.getAttribute('dir')).toBe('rtl');
    expect(option?.textContent).toBe('NDI کانالِ ۱ (APASAI)');
    await closePicker();
  });

  it('CONTROL — a default the Playout still offers carries no tag, and a Latin name stays LTR', async () => {
    const field = await render({ choices: DEFAULT('in-studio1') });
    expect(field.textContent).toBe('Default (Studio 1)');
    expect(field.querySelector('[data-choice-name]')?.getAttribute('dir')).toBe('ltr');
    expect(field.querySelector('.cg-source-tag--unavailable')).toBeNull();
  });

  it('a default the catalogue does not know reads `Not listed`, its id on the title — never the id in the text', async () => {
    const field = await render({ choices: DEFAULT('in-gone-forever') });
    expect(field.textContent).toBe('Default (Not listed)Unavailable');
    expect(field.textContent).not.toContain('in-gone-forever');
    expect(field.querySelector('[data-choice-names]')?.getAttribute('title')).toBe(
      'in-gone-forever',
    );
  });

  it('no default reads `(none set)`; a choice with no source is its words alone', async () => {
    const none = await render({ choices: DEFAULT(null) });
    expect(none.textContent).toBe('Default (none set)');
    act(() => root?.unmount());
    host?.remove();
    const plain = await render({ choices: [{ value: '', label: 'None' }] });
    expect(plain.textContent).toBe('None');
  });

  it('a picker row’s name takes its own direction too', async () => {
    const field = await render({});
    await openPicker(field);
    const persian = document.querySelector('[data-picker-input="in-newscam"] .cg-picker-row__name');
    const latin = document.querySelector('[data-picker-input="in-studio1"] .cg-picker-row__name');
    expect(persian?.getAttribute('dir')).toBe('rtl');
    expect(latin?.getAttribute('dir')).toBe('ltr');
    await closePicker();
  });
});

describe('open — the call site’s choices, then Inputs and Media', () => {
  it('an anchored panel with a tablist and a listbox; the field says it is expanded', async () => {
    const field = await render({});
    const panel = await openPicker(field);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.querySelector('[role="tablist"]')).not.toBeNull();
    expect(panel.querySelector('[role="listbox"]')).not.toBeNull();
    expect(panel.querySelector('[data-picker-choice=""]')?.textContent).toBe('None');
    // Opening asks the bridge to read the Playout again (it decides whether 5 s have passed).
    expect(
      (window as unknown as { cg: { sources: { refresh: { mock: { calls: unknown[] } } } } }).cg
        .sources.refresh.mock.calls.length,
    ).toBe(1);
  });

  it('Inputs lists the Playout’s inputs by NAME, in its order — no kind, no address; the tabs carry counts', async () => {
    const panel = await openPicker(await render({}));
    await settle();
    const names = [...panel.querySelectorAll('[data-picker-input] bdi')].map((b) => b.textContent);
    expect(names).toEqual([
      'Studio 1',
      'دوربین خبر',
      'ورودی ۳',
      'No layer',
      'Channel one only',
      'Studio 7',
      'خروجی کانال ۲',
      'خروجیِ پخش: آپاسای',
      'خروجیِ پخش: کانال دوم',
    ]);
    expect(panel.textContent).not.toMatch(/NDI|Stream|rtsp|STUDIO-PC/);
    const tabs = [...panel.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(['Inputs 9', `Media ${String(LIBRARY.length)}`]);
  });

  it('opens on the tab of the current binding — Media for a media item, Inputs otherwise', async () => {
    const panel = await openPicker(await render({ value: 'md-m-recent' }));
    await settle();
    expect(panel.querySelector('[data-picker-tab="media"]')).not.toBeNull();
    await closePicker();
    act(() => root?.unmount());
    host?.remove();
    const other = await openPicker(await render({ value: 'in-studio1' }));
    expect(other.querySelector('[data-picker-tab="inputs"]')).not.toBeNull();
  });
});

describe('what cannot be chosen is SHOWN, disabled, with the reason — never hidden', () => {
  it('🔴 `R-075` — the playlist output is listed under the Playout’s own name and offered; one the Playout marks unavailable is DISABLED with its reason in words', async () => {
    const onChange = vi.fn();
    const panel = await openPicker(await render({ onChange, channel: 2 }));
    const up = panel.querySelector<HTMLElement>('[data-picker-input="in-pl-apasai"]');
    expect(up?.querySelector('bdi')?.textContent).toBe('خروجیِ پخش: آپاسای');
    expect(up?.getAttribute('aria-disabled')).toBe('false');
    const down = panel.querySelector<HTMLElement>('[data-picker-input="in-pl-cg"]');
    expect(down?.getAttribute('aria-disabled')).toBe('true');
    expect(down?.getAttribute('title')).toBe(
      'Unlicensed in the Playout — it clears that channel every minute.',
    );
    await act(async () => {
      down?.click();
      await Promise.resolve();
    });
    expect(onChange).not.toHaveBeenCalled();
    // CONTROL — an ordinary unavailable input keeps its rule: listed, bindable, tagged.
    const studio7 = panel.querySelector<HTMLElement>('[data-picker-input="in-down"]');
    expect(studio7?.getAttribute('aria-disabled')).toBe('false');
    await act(async () => {
      up?.click();
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith('in-pl-apasai');
  });

  it('🔴 `B-298` — CH 2’s own output is disabled on a CH 2 row with `Own output of CH 2 (would loop)` — control: enabled on CH 1, and an unmarked NDI input is enabled on CH 2', async () => {
    const onChange = vi.fn();
    const panel = await openPicker(await render({ onChange, channel: 2 }));
    const own = panel.querySelector<HTMLElement>('[data-picker-input="in-own2"]');
    expect(own?.getAttribute('aria-disabled')).toBe('true');
    expect(own?.getAttribute('title')).toBe('Own output of CH 2 (would loop)');
    await act(async () => {
      own?.click();
      await Promise.resolve();
    });
    expect(onChange).not.toHaveBeenCalled();
    // Control — an NDI input with no `ownOutputOf` is offered on the same row.
    const studio = panel.querySelector<HTMLElement>('[data-picker-input="in-studio1"]');
    expect(studio?.getAttribute('aria-disabled')).toBe('false');
    await closePicker();
    act(() => root?.unmount());
    host?.remove();
    // Control — on a CH 1 row the same input is offered.
    const one = await openPicker(await render({ channel: 1 }));
    const again = one.querySelector<HTMLElement>('[data-picker-input="in-own2"]');
    expect(again?.getAttribute('aria-disabled')).toBe('false');
    expect(again?.getAttribute('title')).toBeNull();
  });

  it('an unusable input (a route with no layer) is disabled, says why, and cannot be picked', async () => {
    const onChange = vi.fn();
    const panel = await openPicker(await render({ onChange }));
    const route = panel.querySelector<HTMLElement>('[data-picker-input="in-nolayer"]');
    expect(route?.getAttribute('aria-disabled')).toBe('true');
    expect(route?.getAttribute('title')).toBe(ROUTE_NO_LAYER_REASON);
    await act(async () => {
      route?.click();
      await Promise.resolve();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('🔴 `ROUTE-PLATES-01` — the gate is gone: a Playout route on a channel it names is enabled and carries no tag', async () => {
    const onChange = vi.fn();
    const panel = await openPicker(await render({ onChange, channel: 2 }));
    const route = panel.querySelector<HTMLElement>('[data-picker-input="in-input3"]');
    expect(route?.getAttribute('aria-disabled')).toBe('false');
    expect(route?.querySelector('.cg-source-tag')).toBeNull();
    await act(async () => {
      route?.click();
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith('in-input3');
  });

  it('🔴 v1.3 rule 1 — a Playout route on a channel it does NOT name is disabled with `Not available on CH n`', async () => {
    const panel = await openPicker(await render({ channel: 3 }));
    const route = panel.querySelector<HTMLElement>('[data-picker-input="in-input3"]');
    expect(route?.getAttribute('aria-disabled')).toBe('true');
    expect(route?.getAttribute('title')).toBe('Not available on CH 3');
  });

  it('🔴 v1.3 rule 1 — an input not on THIS row’s channel is disabled with `Not available on CH n`', async () => {
    const panel = await openPicker(await render({ channel: 2 }));
    const one = panel.querySelector<HTMLElement>('[data-picker-input="in-ch1only"]');
    expect(one?.getAttribute('aria-disabled')).toBe('true');
    expect(one?.getAttribute('title')).toBe('Not available on CH 2');
    await closePicker();
    act(() => root?.unmount());
    host?.remove();
    // Control: on channel 1 it is not.
    const onOne = await openPicker(await render({ channel: 1 }));
    expect(
      onOne.querySelector('[data-picker-input="in-ch1only"]')?.getAttribute('aria-disabled'),
    ).toBe('false');
  });

  it('an input the Playout marks unavailable (still listed) is bindable, and says so', async () => {
    const panel = await openPicker(await render({}));
    const down = panel.querySelector<HTMLElement>('[data-picker-input="in-down"]');
    expect(down?.getAttribute('aria-disabled')).toBe('false');
    expect(down?.textContent).toContain('Unavailable');
  });
});

describe('🔴 separation — inputs and media never meet', () => {
  it('a media item named `Studio 1` is a media row, with the media icon, and only under Media', async () => {
    const panel = await openPicker(await render({}));
    // Inputs: the INPUT Studio 1, and no media row at all.
    expect(panel.querySelectorAll('[data-picker-media]')).toHaveLength(0);
    expect(panel.querySelector('[data-picker-input="in-studio1"]')).not.toBeNull();
    await pickerTab(panel, 'Media');
    await settle();
    const media = panel.querySelector('[data-picker-media="md-m-studio1"]');
    expect(media?.querySelector('.lucide-film')).not.toBeNull();
    // Media: no input row at all.
    expect(panel.querySelectorAll('[data-picker-input]')).toHaveLength(0);
  });
});

describe('Media — searched on the Playout’s side, a page at a time', () => {
  it('typing is debounced 250 ms, and earlier results stay while the next ones load', async () => {
    const panel = await openPicker(await render({}));
    await pickerTab(panel, 'Media');
    await settle();
    const before = searches.length;
    const search = panel.querySelector<HTMLInputElement>('[data-picker-search]');
    expect(search).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(search, 'Studio');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    expect(searches.length).toBe(before); // not yet
    // Earlier results are still there under the wait.
    expect(panel.querySelectorAll('[data-picker-media]').length).toBeGreaterThan(0);
    await settle(300);
    expect(searches.at(-1)).toEqual({ q: 'Studio' });
    expect(
      [...panel.querySelectorAll('[data-picker-media] bdi')].map((b) => b.textContent),
    ).toContain('Studio 1');
  });

  it('draws only the rows in view, and asks for the next page near the end — once', async () => {
    const panel = await openPicker(await render({}));
    await pickerTab(panel, 'Media');
    await settle();
    const list = panel.querySelector<HTMLElement>('[data-picker-list]');
    // 50 loaded; far fewer drawn.
    expect(panel.querySelectorAll('[data-picker-media]').length).toBeLessThan(30);
    const pagesBefore = searches.filter((s) => s.cursor !== undefined).length;
    await act(async () => {
      if (list === null) return;
      Object.defineProperty(list, 'scrollTop', { value: 50 * 46, configurable: true });
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
      await Promise.resolve();
    });
    await settle();
    const pages = searches.filter((s) => s.cursor !== undefined);
    expect(pages.length - pagesBefore).toBe(1);
    expect(pages.at(-1)?.cursor).toBe('50');
  });

  it('an empty result says so, naming what was asked', async () => {
    const panel = await openPicker(await render({}));
    await pickerTab(panel, 'Media');
    const search = panel.querySelector<HTMLInputElement>('[data-picker-search]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(search, 'zzzz');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    await settle(300);
    expect(panel.querySelector('[data-picker-empty="media"]')?.textContent).toBe(
      'No media matches “zzzz”.',
    );
  });

  it('a Playout that does not answer says so, with Retry', async () => {
    searchDown = true;
    const panel = await openPicker(await render({}));
    await pickerTab(panel, 'Media');
    await settle();
    expect(panel.querySelector('[data-picker-failed]')?.textContent).toContain(
      'The Playout did not answer.',
    );
    searchDown = false;
    const before = searches.length;
    await act(async () => {
      panel.querySelector<HTMLElement>('[data-picker-retry]')?.click();
      await Promise.resolve();
    });
    await settle();
    expect(searches.length).toBe(before + 1);
    expect(panel.querySelector('[data-picker-failed]')).toBeNull();
  });

  it('with an empty query, `Recent` (media bound on this station) comes first, then `All media`', async () => {
    const panel = await openPicker(await render({}));
    await pickerTab(panel, 'Media');
    await settle();
    const headings = [...panel.querySelectorAll('[data-vlist-heading]')].map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(['Recent', 'All media']);
    expect(panel.querySelector('[data-picker-media="md-m-recent"]')?.textContent).toContain(
      'تیتراژ خبر ۲۰',
    );
  });

  it('the current binding is pinned as `Current` when it is not otherwise in view', async () => {
    // Bound to a media item this station bound before; a query that does not match it hides both
    // `Recent` (a query is typed) and the item (not in the results).
    const panel = await openPicker(await render({ value: 'md-m-recent' }));
    await settle();
    const search = panel.querySelector<HTMLInputElement>('[data-picker-search]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(search, 'Studio');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    await settle(300);
    const headings = [...panel.querySelectorAll('[data-vlist-heading]')].map((h) => h.textContent);
    expect(headings[0]).toBe('Current');
    expect(headings).not.toContain('Recent');
    expect(panel.querySelector('[data-picker-media="md-m-recent"]')?.textContent).toContain(
      'تیتراژ خبر ۲۰',
    );
    // Control: when the item IS in view (no query, `Recent` holds it), nothing is pinned.
    await act(async () => {
      setter?.call(search, '');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    await settle(300);
    expect(
      [...panel.querySelectorAll('[data-vlist-heading]')].map((h) => h.textContent),
    ).not.toContain('Current');
  });
});

describe('the keyboard, and a choice returned ONCE', () => {
  it('↓ moves the active option (aria-activedescendant), Enter picks it, and the panel closes', async () => {
    const onChange = vi.fn();
    const field = await render({ onChange });
    const panel = await openPicker(field);
    const list = panel.querySelector<HTMLElement>('[role="listbox"]');
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await Promise.resolve();
    });
    const active = list?.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(document.getElementById(active ?? '')?.getAttribute('data-picker-input')).toBe(
      'in-studio1',
    );
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
    });
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('in-studio1');
    expect(document.querySelector('[data-popover]')).toBeNull();
  });

  it('Escape closes the panel and returns focus to the field', async () => {
    const field = await render({});
    await openPicker(field);
    await closePicker();
    expect(document.querySelector('[data-popover]')).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it('choosing the value already bound returns nothing — only a change is a choice', async () => {
    const onChange = vi.fn();
    const field = await render({ value: 'in-studio1', onChange });
    await choosePickerOption(field, 'in-studio1');
    expect(onChange).not.toHaveBeenCalled();
    // Control: another input IS returned.
    await choosePickerOption(field, 'in-newscam');
    expect(onChange).toHaveBeenCalledWith('in-newscam');
  });

  it('names are INLINE `<bdi>` — the isolate never decides the row’s alignment', async () => {
    const panel = await openPicker(await render({}));
    const bdi = panel.querySelector('[data-picker-input="in-newscam"] bdi');
    expect(bdi?.tagName).toBe('BDI');
    expect(bdi?.parentElement?.tagName).toBe('SPAN');
  });

  it('nothing done in the panel is also done to the surface it hangs from (a portal bubbles through React)', async () => {
    // The surface beneath: a layer row opens its menu on Shift+F10 and on a right-press.
    const beneath = { key: vi.fn(), click: vi.fn(), menu: vi.fn() };
    host = document.createElement('div');
    document.body.append(host);
    const r = createRoot(host);
    root = r;
    await act(async () => {
      r.render(
        createElement(
          'div',
          { onKeyDown: beneath.key, onClick: beneath.click, onContextMenu: beneath.menu },
          createElement(SourcePicker, {
            value: '',
            onChange: () => undefined,
            choices: [{ value: '', label: 'None' }],
            'aria-label': 'Source for guest-1',
          }),
        ),
      );
      await Promise.resolve();
    });
    const field = host.querySelector<HTMLElement>('[role="combobox"]');
    if (field === null) throw new Error('no picker field');
    // Control: the instrument is live — a key and a right-press on the FIELD do reach it.
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      field.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(beneath.key).toHaveBeenCalledTimes(1);
    expect(beneath.menu).toHaveBeenCalledTimes(1);
    beneath.key.mockClear();
    beneath.menu.mockClear();
    const panel = await openPicker(field);
    beneath.click.mockClear(); // the click that opened it
    const list = panel.querySelector<HTMLElement>('[role="listbox"]');
    let menuEvent: MouseEvent | null = null;
    await act(async () => {
      list?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      );
      panel.querySelector<HTMLElement>('[role="tab"]')?.click();
      menuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      list?.dispatchEvent(menuEvent);
      await Promise.resolve();
    });
    expect(beneath.key).not.toHaveBeenCalled();
    expect(beneath.click).not.toHaveBeenCalled();
    expect(beneath.menu).not.toHaveBeenCalled();
    // A right-press INSIDE neither closes the panel nor opens a menu.
    expect((menuEvent as MouseEvent | null)?.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-popover]')).not.toBeNull();
    await closePicker();
  });
});
