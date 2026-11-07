/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetMeta } from '@cg/shared-ipc';
import { ImageChoicesModal } from '../src/renderer/features/inspector/ImageChoicesModal.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function image(assetId: string, filename: string): AssetMeta {
  return {
    assetId,
    filename,
    kind: 'image',
    sha256: 'a'.repeat(64),
    byteSize: 10,
    workingPath: `assets/${filename}`,
  };
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.querySelectorAll('[role="dialog"]').forEach((dialog) => dialog.parentElement?.remove());
  host.remove();
});

describe('operator image choices modal', () => {
  it('shows a thumbnail beside every resolvable project or shared image', () => {
    act(() =>
      root.render(
        createElement(ImageChoicesModal, {
          projectAssets: [image('project-png', '3.png')],
          sharedAssets: [image('shared-svg', '410.svg')],
          imageUrls: {
            'project-png': 'blob:project-png',
            'shared-svg': 'data:image/svg+xml,%3Csvg%2F%3E',
          },
          selected: [],
          onCancel: vi.fn(),
          onSave: vi.fn(),
        }),
      ),
    );

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelectorAll('img')).toHaveLength(2);
    expect(dialog?.textContent).toContain('3.png');
    expect(dialog?.textContent).toContain('410.svg');
  });
});
