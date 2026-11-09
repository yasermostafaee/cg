// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SourcePicker } from '../src/renderer/features/sources/SourcePicker.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { openPicker, pickerTab } from './support/sourcePicker.js';

it('reads only visible media posters, reuses reads, and keeps poster clicks as selection', async () => {
  const jpeg = 'data:image/jpeg;base64,/9j/';
  const items = [
    { id: 'md-clip-a', name: 'Clip A' },
    { id: 'md-clip-b', name: 'Clip B' },
    { id: 'md-clip-c', name: 'Clip C' },
  ];
  const mediaThumbnail = vi
    .fn<RuntimeBridge['sources']['mediaThumbnail']>()
    .mockImplementation(({ id }) =>
      Promise.resolve(id === 'md-clip-b' ? { ok: false } : { ok: true, dataUrl: jpeg }),
    );
  const bridge = {
    sources: {
      config: () =>
        Promise.resolve({
          sources: [
            {
              ...items[0],
              origin: 'media',
              producer: { kind: 'media', file: 'C:/Clips/clip-a.mov' },
              media: { lastBoundAt: '2026-11-09T08:00:00Z' },
            },
          ],
        }),
      assignments: () => Promise.resolve({ assignments: [] }),
      onConfigChanged: () => () => undefined,
      onAssignmentsChanged: () => () => undefined,
      refresh: () => Promise.resolve({ ok: true }),
      mediaSearch: () =>
        Promise.resolve({ ok: true, items, total: items.length, nextCursor: null }),
      mediaThumbnail,
    },
  };
  const visible = new Map<Element, () => void>();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      #target: Element | undefined;
      constructor(private readonly notify: (entries: { isIntersecting: boolean }[]) => void) {}
      observe(element: Element) {
        this.#target = element;
        visible.set(element, () => this.notify([{ isIntersecting: true }]));
      }
      disconnect() {
        if (this.#target !== undefined) visible.delete(this.#target);
      }
    },
  );
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const previous = window.cg;
  window.cg = bridge as unknown as RuntimeBridge;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    initSources(window.cg);
    await act(async () => {
      root.render(
        createElement(SourcePicker, { value: '', onChange, choices: [], 'aria-label': 'Source' }),
      );
    });
    const panel = await openPicker(host.querySelector<HTMLElement>('[role="combobox"]')!);
    expect(mediaThumbnail).not.toHaveBeenCalled();
    await pickerTab(panel, 'Media');
    const tilesOf = (id: string) => [
      ...panel.querySelectorAll<HTMLElement>(`[data-picker-media="${id}"] [data-media-thumbnail]`),
    ];
    const [recent, result] = tilesOf('md-clip-a');
    const [missing] = tilesOf('md-clip-b');
    const [broken] = tilesOf('md-clip-c');
    expect([recent, result, missing, broken].map((tile) => tile?.textContent)).toEqual([
      'No poster',
      'No poster',
      'No poster',
      'No poster',
    ]);
    expect(mediaThumbnail).not.toHaveBeenCalled();
    await act(async () => {
      for (const tile of [recent, result, missing, broken]) visible.get(tile!)!();
    });
    expect(mediaThumbnail.mock.calls).toEqual([
      [{ id: 'md-clip-a' }],
      [{ id: 'md-clip-b' }],
      [{ id: 'md-clip-c' }],
    ]);
    expect(recent?.querySelector('img')?.getAttribute('src')).toBe(jpeg);
    expect(result?.querySelector('img')?.getAttribute('src')).toBe(jpeg);
    expect(missing?.textContent).toBe('No poster');
    await act(async () => {
      broken?.querySelector('img')?.dispatchEvent(new Event('error'));
    });
    expect(broken?.textContent).toBe('No poster');
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      result?.querySelector('img')?.click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('md-clip-a');
  } finally {
    act(() => root.unmount());
    host.remove();
    __resetSourcesForTest();
    window.cg = previous;
    vi.unstubAllGlobals();
  }
});
