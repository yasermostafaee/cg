/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';

/**
 * 🔴 `D-165` — the Assets panel's `Audio…`: each picked sound is converted to the ONE stored form
 * (a 48 kHz stereo WAV) and stored as `kind: 'audio'` WITH its measurements (length, peak); a file
 * that does not convert is named in one notice and the rest still import; a file that is not a
 * sound never reaches the converter. The converter is mocked; its real run is the e2e's.
 */

const { convertAudioToWav } = vi.hoisted(() => ({ convertAudioToWav: vi.fn() }));
vi.mock('../src/renderer/features/assets/video-convert.js', () => ({ convertAudioToWav }));

const { ProjectAssetsPanel } =
  await import('../src/renderer/features/assets/ProjectAssetsPanel.js');
const { designerStore } = await import('../src/renderer/state/store.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A tiny 16-bit stereo WAV: 4 800 frames (0.1 s at 48 kHz), loudest sample half scale. */
function wavBytes(): Uint8Array {
  const frames = 4800;
  const data = Buffer.alloc(frames * 4);
  data.writeInt16LE(16384, 0);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24);
  h.writeUInt32LE(192000, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([h, data]));
}

const noop = (): void => undefined;
const file = (name: string): File => ({ name }) as unknown as File;
let picked: File[] = [];
const storeBytes = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  picked = [];
  storeBytes.mockImplementation((req: { filename: string; kind: AssetMeta['kind'] }) =>
    Promise.resolve({
      asset: {
        assetId: req.filename,
        kind: req.kind,
        filename: req.filename,
        sha256: 'a'.repeat(64),
        byteSize: 1,
        workingPath: 'x',
      } satisfies AssetMeta as AssetMeta,
    }),
  );
  (window as unknown as { cg: unknown }).cg = {
    assets: {
      list: () => Promise.resolve([]),
      onImported: () => noop,
      onCleared: () => noop,
      url: () => Promise.resolve(null),
      pick: (kind: string) => Promise.resolve(kind === 'audio' ? picked : []),
      storeBytes,
      remove: () => Promise.resolve({ ok: true }),
    },
  };
  designerStore.showNotice('');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(ProjectAssetsPanel)));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function importAudio(): Promise<void> {
  act(() => {
    host!
      .querySelector('[aria-label="Add asset"]')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  const item = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Audio…');
  if (item === undefined) throw new Error('no Audio… item');
  await act(async () => {
    item.click();
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe('D-165 — Audio… in the Assets panel', () => {
  it('🔴 a sound is stored as ONE WAV with its measurements — length and peak', async () => {
    picked = [file('whoosh.mp3')];
    convertAudioToWav.mockResolvedValue({ ok: true, bytes: wavBytes() });
    await importAudio();
    expect(convertAudioToWav).toHaveBeenCalledWith(picked[0]);
    expect(storeBytes).toHaveBeenCalledTimes(1);
    expect(storeBytes.mock.calls[0]![0]).toMatchObject({
      filename: 'whoosh.wav',
      kind: 'audio',
      audio: {
        sourceFilename: 'whoosh.mp3',
        durationMs: 100,
        peakDbfs: -6,
        sampleRate: 48000,
        channels: 2,
      },
    });
  });

  it('a file that does not convert is NAMED, and the others still import', async () => {
    picked = [file('good.wav'), file('broken.ogg')];
    convertAudioToWav.mockImplementation((f: File) =>
      Promise.resolve(
        f.name === 'broken.ogg'
          ? { ok: false, logTail: ['Invalid data'] }
          : { ok: true, bytes: wavBytes() },
      ),
    );
    await importAudio();
    expect(storeBytes).toHaveBeenCalledTimes(1);
    expect(designerStore.get().notice).toContain('broken.ogg');
  });

  it('a picked file that is not a sound never reaches the converter', async () => {
    picked = [file('notes.pdf')];
    await importAudio();
    expect(convertAudioToWav).not.toHaveBeenCalled();
    expect(storeBytes).not.toHaveBeenCalled();
    expect(designerStore.get().notice).toContain('notes.pdf');
  });
});

describe('D-165 — dropping a sound places ONE audio element', () => {
  it('🔴 named after its file, its length the asset’s, at the entrance at 0 dB — and selected', async () => {
    const { insertAudioFromAsset } =
      await import('../src/renderer/features/canvas/CanvasOverlay.js');
    const { editSceneOf } = await import('../src/renderer/state/store.js');
    designerStore.setScene(
      {
        schemaVersion: 1,
        id: 's',
        name: 's',
        templateType: 'custom',
        resolution: { width: 1920, height: 1080 },
        frameRate: 50,
        safeAreas: { title: 10, action: 5 },
        frameRange: { in: 0, out: 250 },
        editorBackdrop: 'transparent',
        layers: [
          { id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children: [] },
        ],
        fields: [],
        bindings: [],
        fonts: [],
        metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
      } as never,
      null,
    );
    (window as unknown as { cg: { assets: { list: () => Promise<AssetMeta[]> } } }).cg.assets.list =
      () =>
        Promise.resolve([
          {
            assetId: 'snd-1',
            kind: 'audio',
            filename: 'whoosh.wav',
            sha256: 'a'.repeat(64),
            byteSize: 1,
            workingPath: 'x',
            audio: {
              sourceFilename: 'whoosh.mp3',
              durationMs: 900,
              peakDbfs: -3,
              sampleRate: 48000,
              channels: 2,
            },
          },
        ]);
    await act(async () => {
      await insertAudioFromAsset('snd-1');
    });
    const st = designerStore.get();
    const children = editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children;
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      type: 'audio',
      name: 'whoosh',
      assetId: 'snd-1',
      durationMs: 900,
      start: { at: 'entrance' },
      volumeDb: 0,
    });
    expect([...st.selection]).toEqual([children[0]!.id]);
  });

  it('an asset with no measurement places nothing and says so', async () => {
    const { insertAudioFromAsset } =
      await import('../src/renderer/features/canvas/CanvasOverlay.js');
    await act(async () => {
      await insertAudioFromAsset('not-there');
    });
    expect(designerStore.get().notice).toBe('That sound could not be read.');
  });
});
