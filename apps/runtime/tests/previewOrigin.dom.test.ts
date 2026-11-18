// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { SourceDefinition, SourcePreviewFrame } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import type * as MeterModule from '../src/renderer/features/sources/InputAudioMeter.js';
import { InputThumbnail } from '../src/renderer/features/sources/InputThumbnail.js';
import { SourcePresenceBadges } from '../src/renderer/features/sources/SourcePresenceBadges.js';
import { usePreviewOrigins } from '../src/renderer/features/sources/usePreviewOrigins.js';
import { ChoiceLabel } from '../src/renderer/features/sources/SourcePicker.js';
import { SourceLabel } from '../src/renderer/features/sources/SourceLabel.js';
import {
  initSources,
  __resetSourcesForTest,
} from '../src/renderer/features/sources/sourceStore.js';

const readers = vi.hoisted(() => new Set<(frame: SourcePreviewFrame) => void>());
vi.mock('../src/renderer/features/sources/inputThumbnailDemand.js', () => ({
  subscribeInputThumbnail: ({ publish }: { publish: (frame: SourcePreviewFrame) => void }) => {
    readers.add(publish);
    return () => readers.delete(publish);
  },
}));
vi.mock('../src/renderer/features/sources/InputAudioMeter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof MeterModule>()),
  InputAudioMeter: () => null,
}));
vi.mock('../src/renderer/features/monitors/liveInputCheckContext.js', () => ({
  useLiveInputCheck: () => null,
}));

const source: SourceDefinition = {
  id: 'studio',
  name: 'Studio',
  origin: 'input',
  aspect: 16 / 9,
  producer: { kind: 'ndi', source: 'Studio' },
};
function Tile({ kind }: { kind: 'standalone' | 'direct' | 'inherited' }) {
  const { origins, publish } = usePreviewOrigins();
  const presence = {
    engines: ['A', 'B'] as ('A' | 'B')[],
    sources: { studio: { A: 'present' as const, B: 'present' as const } },
  };
  if (kind === 'direct')
    return createElement(SourceLabel, { sourceId: source.id, meterChannel: 1, presence });
  if (kind === 'inherited')
    return createElement(ChoiceLabel, {
      choice: { value: '', label: 'Default', names: source.id },
      meterChannel: 1,
      presence,
    });
  return createElement(
    Fragment,
    null,
    createElement(InputThumbnail, {
      source,
      channel: 1,
      meterChannel: undefined,
      onPreviewEngineChange: (engine) => publish(source.id, engine),
    }),
    createElement(SourcePresenceBadges, {
      sourceId: source.id,
      presence: { engines: ['A', 'B'], sources: { studio: { A: 'present', B: 'present' } } },
      previewEngine: origins.get(source.id),
    }),
  );
}
afterEach(() => {
  readers.clear();
  vi.unstubAllGlobals();
});

it.each(['standalone', 'direct', 'inherited'] as const)(
  'emphasizes only the decoded provider for a %s label, retaining A until B decodes',
  async (kind) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) {
          this.callback(
            [{ target, isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        disconnect() {
          return undefined;
        }
      },
    );
    const previous = window.cg;
    window.cg = { sourcePreviews: {} } as unknown as RuntimeBridge;
    __resetSourcesForTest();
    const stopSources = initSources({
      sources: {
        config: async () => ({ sources: [source] }),
        assignments: async () => ({ assignments: [] }),
        onConfigChanged: () => () => undefined,
        onAssignmentsChanged: () => () => undefined,
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const provider = () =>
      host
        .querySelector('[data-source-preview-provider]')
        ?.getAttribute('data-source-presence-server');
    const publish = async (frame: SourcePreviewFrame) =>
      act(async () => {
        for (const read of readers) read(frame);
      });
    try {
      await act(async () => root.render(createElement(Tile, { kind })));
      expect(provider()).toBeUndefined();
      await publish({ sourceId: 'studio', signal: 'present', jpegBase64: 'first', engine: 'A' });
      expect(provider()).toBeUndefined();
      await act(async () => host.querySelector('img')!.dispatchEvent(new Event('load')));
      expect(provider()).toBe('A');
      const decodedImage = host.querySelector('img')!;
      Object.defineProperties(decodedImage, {
        complete: { configurable: true, value: true },
        naturalWidth: { configurable: true, value: 64 },
      });
      await publish({ sourceId: 'studio', signal: 'present', jpegBase64: 'first', engine: 'B' });
      expect(provider()).toBe('B');
      await publish({ sourceId: 'studio', signal: 'present', jpegBase64: 'first', engine: 'A' });
      expect(provider()).toBe('A');
      await publish({ sourceId: 'studio', signal: 'present', jpegBase64: 'next', engine: 'B' });
      expect(provider()).toBe('A');
      await act(async () => host.querySelector('img')!.dispatchEvent(new Event('load')));
      expect(provider()).toBe('B');
      expect(host.querySelector('[data-source-preview-provider]')?.getAttribute('title')).toBe(
        'Server B: available. Preview from server B',
      );
      expect(host.querySelectorAll('[data-source-presence-state="present"]')).toHaveLength(2);
      await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')));
      expect(provider()).toBeUndefined();
      await publish({ sourceId: 'studio', signal: 'present', jpegBase64: 'restored', engine: 'A' });
      expect(provider()).toBeUndefined();
      await act(async () => host.querySelector('img')!.dispatchEvent(new Event('load')));
      expect(provider()).toBe('A');
      await publish({ sourceId: 'studio', signal: 'absent', engine: 'B' });
      expect(provider()).toBeUndefined();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      window.cg = previous;
      stopSources();
      __resetSourcesForTest();
    }
  },
);
