/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { PreviewModal } from '../src/renderer/features/fields/PreviewModal.js';
import { designerStore } from '../src/renderer/state/store.js';
import {
  resetDesignerFileSourcePreviewsForTest,
  setDesignerFileSourcePreview,
} from '../src/renderer/features/fields/fileSourcePreviewStore.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PreviewLoad = Window['cg']['preview']['load'];
type LoadedDocument = Awaited<ReturnType<PreviewLoad>>;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let pendingLoads: ((document: LoadedDocument) => void)[] = [];
const close = vi.fn();
const load = vi.fn<PreviewLoad>();
const html = '<!doctype html><html><body></body></html>';

beforeEach(() => {
  designerStore._reset();
  resetDesignerFileSourcePreviewsForTest();
  pendingLoads = [];
  close.mockClear();
  load.mockReset().mockImplementation(() => new Promise((resolve) => pendingLoads.push(resolve)));
  const library = {
    list: () => Promise.resolve([]),
    onImported: () => () => undefined,
    onCleared: () => () => undefined,
  };
  (window as unknown as { cg: unknown }).cg = {
    assets: library,
    sharedImages: library,
    preview: { load },
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn<ResizeObserver['observe']>();
      unobserve = vi.fn<ResizeObserver['unobserve']>();
      disconnect = vi.fn<ResizeObserver['disconnect']>();
    },
  );
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  designerStore._reset();
  resetDesignerFileSourcePreviewsForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function scene(name = 'Readiness'): Scene {
  return new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(name, 'custom').scene;
}

async function render(value: Scene): Promise<void> {
  await act(async () => {
    root?.render(createElement(PreviewModal, { scene: value, onClose: close }));
    await Promise.resolve();
  });
}

function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
  if (result === undefined) throw new Error(`Missing ${label}`);
  return result;
}

function iframe(): HTMLIFrameElement {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="cgpreview-modal"]');
  if (frame === null) throw new Error('Missing Preview document');
  return frame;
}

async function resolveLoad(index = 0): Promise<void> {
  await act(async () => {
    pendingLoads[index]?.({ html, src: 'https://example.test/preview' });
    await Promise.resolve();
  });
}

function ready(source: MessageEventSource | null): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        data: { kind: 'cg-preview-ready' },
      }),
    );
  });
}

function elapsed(): string | null | undefined {
  return document.querySelector('output[aria-label="Elapsed preview time"] strong')?.textContent;
}

describe('D-173 — Preview commands wait for their own ready document', () => {
  it('sends Reset the exact current file-connected seed, not authored fallback rows', async () => {
    const s = scene();
    s.fields = [
      {
        id: 'rows',
        label: 'Rows',
        type: 'list',
        required: false,
        default: [{ id: 'authored', text: 'Authored row' }],
        fileSource: { bridgePath: 'rows.csv', inputMode: 'file-only' },
      },
    ];
    const rows = [{ id: 'file', text: 'Connected row' }];
    setDesignerFileSourcePreview({
      sceneId: s.id,
      fieldId: 'rows',
      bridgePath: 'rows.csv',
      displayPath: 'rows.csv',
      content: 'text\nConnected row',
      value: rows,
    });
    await render(s);
    await resolveLoad();
    const target = iframe().contentWindow!;
    ready(target);
    const post = vi.spyOn(target, 'postMessage');
    act(() => button('Reset').click());
    expect(post).toHaveBeenCalledWith(
      { kind: 'cg-preview', action: 'reset', fields: { rows } },
      '*',
    );
    expect(elapsed()).toBe('00:00:00');
    expect(button('Play').disabled).toBe(false);
  });

  it('does not start a phantom run before ready, and does not autoplay when ready arrives', async () => {
    await render(scene());
    for (const label of ['Play', 'Pause', 'Stop', 'Previous', 'Next']) {
      expect(button(label).disabled).toBe(true);
      expect(button(label).title).toBe('Preview loading');
    }
    expect(button('Reset').disabled).toBe(false);
    expect(button('Close').disabled).toBe(false);
    expect(document.querySelector('[role="dialog"] summary')?.textContent).toBe('Advanced');
    act(() => button('Play').click());
    expect(elapsed()).toBe('00:00:00');

    await resolveLoad();
    const target = iframe().contentWindow!;
    const post = vi.spyOn(target, 'postMessage');
    expect(button('Play').disabled).toBe(true);
    ready(window);
    expect(button('Play').disabled).toBe(true);
    expect(post).not.toHaveBeenCalled();

    ready(target);
    expect(button('Play').disabled).toBe(false);
    expect(button('Pause').disabled).toBe(false);
    expect(button('Stop').disabled).toBe(false);
    expect(button('Next').disabled).toBe(true); // The normal single-step rule still applies.
    expect(elapsed()).toBe('00:00:00');
    expect(
      post.mock.calls.some(([message]) => (message as { action?: string }).action === 'play'),
    ).toBe(false);

    act(() => button('Play').click());
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ action: 'play' }), '*');
    act(() => button('Pause').click());
    expect(button('Resume').disabled).toBe(false);
    act(() => button('Resume').click());
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ action: 'resume' }), '*');
    act(() => button('Stop').click());
    expect(elapsed()).toBe('00:00:00');
  });

  it('requires a fresh handshake after regeneration, even for identical HTML and the same scene id', async () => {
    const original = scene();
    await render(original);
    await resolveLoad();
    const previousFrame = iframe();
    const previousWindow = previousFrame.contentWindow!;
    ready(previousWindow);
    expect(button('Play').disabled).toBe(false);

    await render({ ...original, name: 'Changed composition' });
    expect(button('Play').disabled).toBe(true);
    expect(document.querySelector('iframe[title="cgpreview-modal"]')).toBeNull();
    ready(previousWindow);
    expect(button('Play').disabled).toBe(true);
    await resolveLoad(1);
    expect(iframe()).not.toBe(previousFrame);
    expect(iframe().contentWindow).not.toBe(previousWindow);
    ready(previousWindow);
    expect(button('Play').disabled).toBe(true);
    ready(iframe().contentWindow);
    expect(button('Play').disabled).toBe(false);
    expect(elapsed()).toBe('00:00:00');
  });

  it('ignores an obsolete load response and permits closing while the current load is pending', async () => {
    await render(scene('Old'));
    await render(scene('Current'));
    await resolveLoad(0);
    expect(document.querySelector('iframe[title="cgpreview-modal"]')).toBeNull();
    expect(button('Play').disabled).toBe(true);
    act(() => button('Close').click());
    expect(close).toHaveBeenCalledTimes(1);
    await resolveLoad(1);
    ready(iframe().contentWindow);
    expect(button('Play').disabled).toBe(false);
  });
});
