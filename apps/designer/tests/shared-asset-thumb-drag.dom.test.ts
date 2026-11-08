/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';

vi.mock('../src/renderer/features/sharedLibrary/useSharedImages.js', () => ({
  emitSharedImageRemoved: () => undefined,
  useSharedImages: () => [],
  useSharedImageUrl: () => 'blob:shared-logo',
}));

import { SharedAssetThumb } from '../src/renderer/features/sharedLibrary/SharedLibraryPanel.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const image: AssetMeta = {
  assetId: 'shared-logo-1',
  kind: 'image',
  filename: 'station-logo.png',
  sha256: 'a'.repeat(64),
  byteSize: 1234,
  workingPath: 'shared/images/station-logo.png',
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(layout: 'grid' | 'list'): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(SharedAssetThumb, {
        asset: image,
        layout,
        active: false,
        onSelect: () => undefined,
        onContextMenu: () => undefined,
      }),
    );
  });
  return host.firstElementChild as HTMLElement;
}

describe('D-204 — Shared Library images drag onto the Canvas', () => {
  it.each(['grid', 'list'] as const)(
    '%s tile owns the drag and carries shared identity',
    (layout) => {
      const tile = render(layout);
      expect(tile.draggable).toBe(true);
      expect(tile.querySelector('img')?.draggable).toBe(false);
      const setData = vi.fn();
      const event = new Event('dragstart', { bubbles: true });
      Object.defineProperty(event, 'dataTransfer', {
        value: { setData, effectAllowed: 'none' },
      });

      act(() => tile.dispatchEvent(event));

      expect(setData).toHaveBeenCalledWith('application/x-cg-asset-id', 'shared-logo-1');
      expect(setData).toHaveBeenCalledWith('application/x-cg-asset-kind', 'image');
      expect(setData).toHaveBeenCalledWith('application/x-cg-asset-source', 'shared');
    },
  );
});
