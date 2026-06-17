/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';

// The thumbnail <img> only renders once useAssetUrl resolves; stub it so the
// image renders synchronously (the bridge/blob URL isn't under test here).
vi.mock('../src/renderer/features/assets/useAssets.js', () => ({
  useAssetUrl: () => 'blob:fake-thumb-url',
}));

import { AssetThumb } from '../src/renderer/features/assets/AssetThumb.js';

/**
 * B-019 — grabbing an image THUMBNAIL must add it to the canvas, like grabbing the
 * name does. The thumbnail `<img>` is natively draggable; left enabled it starts a
 * browser image-drag (no `x-cg-asset-id` payload → the canvas drop inserts nothing).
 * The fix sets `draggable={false}` on the `<img>` so the cell `<div>` is the SOLE
 * drag source — both grab points then start the cell drag and set the payload.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const imageAsset: AssetMeta = {
  assetId: 'asset-img-1',
  kind: 'image',
  filename: 'logo.png',
  sha256: 'a'.repeat(64),
  byteSize: 1234,
  workingPath: 'projects/p/assets/image/x.png',
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

function render(layout: 'grid' | 'list'): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(AssetThumb, { asset: imageAsset, layout })));
  return container;
}

describe('AssetThumb — thumbnail drag (B-019)', () => {
  it('the thumbnail <img> is NOT natively draggable (grid layout)', () => {
    const c = render('grid');
    const img = c.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('draggable')).toBe('false');
    expect(img!.draggable).toBe(false);
  });

  it('the thumbnail <img> is NOT natively draggable (list layout)', () => {
    const c = render('list');
    expect(c.querySelector('img')!.draggable).toBe(false);
  });

  it('the cell is the drag source and sets the x-cg-asset-id payload to the asset id', () => {
    const c = render('grid');
    const cell = c.firstElementChild as HTMLElement;
    expect(cell.draggable).toBe(true);

    // Fire a dragstart on the cell with a mock dataTransfer; assert the payload that
    // the canvas drop (CanvasOverlay.onDrop) reads back under the same key.
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: 'none' };
    const evt = new Event('dragstart', { bubbles: true });
    Object.defineProperty(evt, 'dataTransfer', { value: dataTransfer });
    act(() => {
      cell.dispatchEvent(evt);
    });
    expect(setData).toHaveBeenCalledWith('application/x-cg-asset-id', 'asset-img-1');
  });
});
