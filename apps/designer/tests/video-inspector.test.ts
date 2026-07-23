/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Scene, VideoElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultVideo } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';

/**
 * D-128 Phase 3 — the video element Inspector (decision (d)): poster preview,
 * hold behaviour, drivesHold, the manual phase marks (ms), and the read-only
 * provenance note (decision (e)). It never exposes inner content.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => undefined;
const VIDEO_ASSET: AssetMeta = {
  assetId: 'asset-clip',
  kind: 'video',
  filename: 'Lower_Default.webm',
  sha256: 'a'.repeat(64),
  byteSize: 4096,
  workingPath: 'projects/p/assets/video/x.webm',
  provenance: {
    sourceFilename: 'Lower_Default.avi',
    sourceFps: 25,
    targetFps: 50,
    sourceWidth: 1920,
    sourceHeight: 282,
    sourceSha256: 'b'.repeat(64),
  },
};

(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([VIDEO_ASSET]),
    url: () => Promise.resolve('blob:vid'),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'custom');
  designerStore.setScene({ ...scene, frameRate: 50 } as Scene, null);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

async function render(el: VideoElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(StyleSection, { element: el, selectedKeyframe: null }));
  });
  await act(async () => {
    await Promise.resolve(); // let useAssets.list() + useAssetUrl() resolve
  });
  return container;
}

const el = (over: Partial<VideoElement> = {}): VideoElement => ({
  ...defaultVideo('v1', 960, 540, 'asset-clip', 40_000, { width: 1920, height: 282 }),
  ...over,
});

describe('VideoSections inspector (D-128 Phase 3)', () => {
  it('shows the poster <video>, hold + drivesHold selects, and the read-only provenance note', async () => {
    const c = await render(el());
    // poster preview is a seeked <video>, not a placeholder
    expect(c.querySelector('video')?.getAttribute('src')).toBe('blob:vid');
    // decision (d) controls
    expect(c.querySelector('[aria-label="on hold"]')).not.toBeNull();
    expect(c.querySelector('[aria-label="drives hold"]')).not.toBeNull();
    // holdBehavior default is 'loop'
    expect((c.querySelector('[aria-label="on hold"]') as HTMLSelectElement).value).toBe('loop');
    // decision (e) — provenance surfaced READ-ONLY, naming the source + the conform
    const prov = c.querySelector('[data-testid="video-provenance"]');
    expect(prov?.textContent).toContain('Lower_Default.avi');
    expect(prov?.textContent).toContain('1920×282');
    expect(prov?.textContent).toContain('25→50 fps');
  });

  it('with NO phase marks: offers "Add phase marks" and the whole-clip explanation', async () => {
    const c = await render(el());
    expect(c.textContent).toContain('No phase marks');
    const addBtn = [...c.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Add phase marks'),
    );
    expect(addBtn).toBeTruthy();
    // no in/out inputs until phases exist
    expect(c.querySelector('[aria-label="in point"]')).toBeNull();
  });

  it('with phase marks: exposes manual in/out point inputs (ms) and the poster-frame readout', async () => {
    const c = await render(el({ phases: { introEnd: 8000, outroStart: 30_000 } }));
    expect(c.querySelector('[aria-label="in point"]')).not.toBeNull();
    expect(c.querySelector('[aria-label="out point"]')).not.toBeNull();
    expect((c.querySelector('[aria-label="in point"]') as HTMLInputElement).value).toBe('8000');
    // poster follows the In point (8.00 s), per decision (a)
    expect(c.textContent).toContain('Poster frame: 8.00 s');
  });

  it('never exposes the clip inner content (opaque by design) — no source-editing field', async () => {
    const c = await render(el());
    // the section is titled "Video" and shows no crop/source editor
    expect(c.textContent).toContain('Video');
    expect(c.textContent).not.toContain('Re-crop');
    expect(c.textContent).not.toContain('Edit source');
  });
});
