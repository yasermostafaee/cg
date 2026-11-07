/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageElement } from '@cg/shared-schema';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/renderer/features/assets/useAssets.js', () => ({
  useAssets: () => [
    {
      assetId: 'project-logo',
      kind: 'image',
      filename: 'project-logo.png',
      sha256: 'a'.repeat(64),
      byteSize: 10,
      workingPath: 'assets/project-logo.png',
    },
  ],
}));

vi.mock('../src/renderer/features/sharedLibrary/useSharedImages.js', () => ({
  useSharedImages: () => [
    {
      assetId: 'shared-logo',
      kind: 'image',
      filename: 'shared-logo.svg',
      sha256: 'b'.repeat(64),
      byteSize: 10,
      workingPath: 'shared/shared-logo.svg',
    },
  ],
}));

vi.mock('../src/renderer/features/fields/useImageAssetUrls.js', () => ({
  useImageAssetUrls: () => ({
    'project-logo': 'blob:project-logo',
    'shared-logo': 'blob:shared-logo',
  }),
}));

import { SharedImagePicker } from '../src/renderer/features/sharedLibrary/SharedImagePicker.js';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe('image source picker', () => {
  it('keeps a project image selected and offers both project and shared sources visually', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const element = {
      id: 'image-1',
      type: 'image',
      name: 'Logo',
      assetId: 'project-logo',
      source: 'project',
    } as unknown as ImageElement;

    act(() => root?.render(createElement(SharedImagePicker, { element })));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="picture source"]');
    expect(trigger?.textContent).toContain('project-logo (project)');
    expect(trigger?.querySelector('img')?.src).toBe('blob:project-logo');

    act(() => trigger?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('project-logo (project)');
    expect(dialog?.textContent).toContain('shared-logo (shared)');
    expect(dialog?.querySelectorAll('img')).toHaveLength(2);
  });
});
