/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta } from '@cg/shared-ipc';
import type { AudioElement, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultAudio } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';

/**
 * The Sound section applies or removes a gain on the selected placement and can still measure
 * older assets from their bytes.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A 1 s 997 Hz stereo sine at `dbfs` as 16-bit 48 kHz WAV bytes. */
function sineWav(dbfs: number): Uint8Array {
  const rate = 48_000;
  const data = Buffer.alloc(rate * 4);
  const a = Math.pow(10, dbfs / 20);
  for (let n = 0; n < rate; n++) {
    const v = Math.round(a * Math.sin((2 * Math.PI * 997 * n) / rate) * 32767);
    data.writeInt16LE(v, n * 4);
    data.writeInt16LE(v, n * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([h, data]));
}

function soundAsset(assetId: string, audio: Partial<NonNullable<AssetMeta['audio']>>): AssetMeta {
  return {
    assetId,
    kind: 'audio',
    filename: 'whoosh.wav',
    sha256: 'a'.repeat(64),
    byteSize: 1,
    workingPath: 'x',
    audio: {
      sourceFilename: 'whoosh.mp3',
      durationMs: 1000,
      peakDbfs: -14,
      sampleRate: 48000,
      channels: 2,
      ...audio,
    },
  };
}

const noUnsub = (): void => undefined;
let assets: AssetMeta[] = [];
let bytes: Uint8Array = new Uint8Array();
const storeBytes = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  storeBytes.mockReset();
  (window as unknown as { cg: unknown }).cg = {
    assets: {
      list: () => Promise.resolve(assets),
      url: (id: string) => Promise.resolve(`blob:${id}`),
      onImported: () => noUnsub,
      onCleared: () => noUnsub,
      storeBytes,
    },
    sharedImages: {
      list: () => Promise.resolve([]),
      url: () => Promise.resolve(null),
      onImported: () => noUnsub,
    },
  };
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(bytes.slice().buffer) }),
  );
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  designerStore._reset();
});

function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

const sounds = (): AudioElement[] =>
  projected().layers.flatMap((l) =>
    l.children.filter((c): c is AudioElement => c.type === 'audio'),
  );

/** Two placements of one sound. */
function seed(assetId = 'snd-1'): void {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'sounds',
    'lower-third',
  );
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultAudio('s1', assetId, 1000, 'whoosh'));
  designerStore.addElement(defaultAudio('s2', assetId, 1000, 'whoosh again'));
}

async function render(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await showSound();
  return container;
}

async function showSound(index = 0): Promise<void> {
  const element = sounds()[index]!;
  act(() => root?.render(createElement(StyleSection, { element, selectedKeyframe: null })));
  await settle();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const q = (host: ParentNode, id: string): HTMLElement | null =>
  host.querySelector(`[data-testid="${id}"]`);

describe('Normalisation of a selected sound layer', () => {
  it('applies only to the selected layer and supports Undo and Remove normalisation', async () => {
    bytes = sineWav(-14);
    assets = [soundAsset('snd-1', { loudnessLufs: -14, truePeakDbtp: -14 })];
    seed();
    designerStore.updateElement('s1', { volumeDb: -5 });
    const host = await render();

    expect(q(host, 'audio-loudness')?.textContent).toBe('−14.0 LUFS');
    expect(q(host, 'audio-true-peak')?.textContent).toBe('−14.0 dBTP');
    const offer = q(host, 'audio-normalise') as HTMLButtonElement | null;
    expect(offer?.textContent).toBe('Normalise to −23.0 LUFS');
    expect(offer?.title).toContain('−9.0 dB');

    act(() => offer!.click());
    expect(storeBytes).not.toHaveBeenCalled();
    expect(sounds()).toMatchObject([
      { assetId: 'snd-1', normalisationGainDb: -9, volumeDb: -5 },
      { assetId: 'snd-1', volumeDb: 0 },
    ]);
    expect(sounds()[1]?.normalisationGainDb).toBeUndefined();
    await showSound();
    expect(q(host, 'audio-loudness')?.textContent).toBe('−23.0 LUFS');
    expect(q(host, 'audio-peak')?.textContent).toBe('−23.0 dBFS');
    expect(q(host, 'audio-true-peak')?.textContent).toBe('−23.0 dBTP');
    expect(q(host, 'audio-normalisation-gain')?.textContent).toBe('−9.0 dB');

    await showSound(1);
    expect(q(host, 'audio-loudness')?.textContent).toBe('−14.0 LUFS');
    expect(q(host, 'audio-peak')?.textContent).toBe('−14.0 dBFS');
    expect(q(host, 'audio-normalisation-gain')).toBeNull();
    act(() => designerStore.undo());
    expect(sounds()[0]?.normalisationGainDb).toBeUndefined();
    expect(sounds()[0]?.volumeDb).toBe(-5);
    act(() => designerStore.redo());

    await showSound();
    const remove = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Remove normalisation',
    );
    expect(remove).toBeDefined();
    act(() => remove!.click());
    await showSound();
    expect(q(host, 'audio-loudness')?.textContent).toBe('−14.0 LUFS');
    expect(q(host, 'audio-normalise')).not.toBeNull();
    expect(sounds()[0]?.normalisationGainDb).toBeUndefined();
    expect(sounds()[0]?.volumeDb).toBe(-5);
  });
});

describe('Existing sound assets', () => {
  it('a previously baked WAV keeps its measured level and asset reference', async () => {
    bytes = sineWav(-23);
    assets = [
      {
        ...soundAsset('snd-baked', { loudnessLufs: -23.1, truePeakDbtp: -23 }),
        filename: 'whoosh (-23.0 LUFS).wav',
      },
    ];
    seed('snd-baked');
    const host = await render();
    expect(q(host, 'audio-loudness')?.textContent).toBe('−23.1 LUFS');
    expect(q(host, 'audio-normalise')).toBeNull();
    expect(sounds().map((s) => s.assetId)).toEqual(['snd-baked', 'snd-baked']);
    expect(sounds()[0]?.normalisationGainDb).toBeUndefined();
  });

  it('a sound stored before loudness was measured is measured from its bytes', async () => {
    bytes = sineWav(-14);
    assets = [soundAsset('snd-old', {})];
    seed('snd-old');
    const host = await render();
    expect(q(host, 'audio-loudness')?.textContent).toBe('−14.0 LUFS');
    expect(q(host, 'audio-normalise')?.textContent).toBe('Normalise to −23.0 LUFS');
  });
});
