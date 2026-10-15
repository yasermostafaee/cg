/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Scene } from '@cg/shared-schema';
import type { ImageSequenceSource } from '../src/renderer/features/assets/video-convert-args.js';

/**
 * 🔴 `D-164` — **THE IMAGE-SEQUENCE STEP: every problem NAMED before anything converts.** Real
 * Files whose first bytes are a PNG header, so the 24-byte header reads run as they do in the app.
 * Continue hands `VideoImportModal` one source; Cancel hands nothing.
 */

const { designerStore } = await import('../src/renderer/state/store.js');
const { ImageSequenceImportModal } =
  await import('../src/renderer/features/assets/ImageSequenceImportModal.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
  jsdom 25's Blob has no `arrayBuffer()` (Chrome's does — the header read uses it). Read through
  jsdom's FileReader instead, so the modal's real `readFrameSize` runs on real bytes. The last case
  (junk headers) is the control that a failed read still reports, rather than this shim hiding it.
*/
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsArrayBuffer(this);
    });
  };
}

function scene(frameRate: number): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-seq',
    name: 'Sequence',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate,
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
  } as unknown as Scene;
}

/** A file whose bytes start with a PNG signature and an IHDR of `w × h`. */
function png(name: string, w = 64, h = 64, relative = ''): File {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, w);
  view.setUint32(20, h);
  const file = new File([bytes], name, { type: 'image/png' });
  if (relative !== '') Object.defineProperty(file, 'webkitRelativePath', { value: relative });
  return file;
}

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onContinue = vi.fn<(source: ImageSequenceSource) => void>();

beforeEach(() => {
  vi.clearAllMocks();
  designerStore.setScene(scene(25), null);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function open(files: File[]): Promise<void> {
  await act(async () => {
    root.render(createElement(ImageSequenceImportModal, { files, onClose, onContinue }));
  });
  // The header reads settle.
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function button(label: string): HTMLButtonElement {
  const hit = [...document.querySelectorAll('button')].find((b) => b.textContent === label);
  if (hit === undefined) throw new Error(`no button "${label}"`);
  return hit;
}

const text = (testid: string): string =>
  document.querySelector(`[data-testid="${testid}"]`)?.textContent ?? '';

function handedOn(): ImageSequenceSource {
  const call = onContinue.mock.calls[0];
  if (call === undefined) throw new Error('Continue handed nothing on');
  return call[0];
}

describe('D-164 — the image-sequence step', () => {
  it('🔴 a gap and a frame of another size are NAMED before converting; Continue holds both', async () => {
    // f3 is missing; f4 is 32×32 against the sequence's 64×64.
    await open([png('f5.png'), png('f1.png'), png('f4.png', 32, 32), png('f2.png')]);
    expect(text('sequence-missing')).toContain('f3.png');
    expect(text('sequence-size')).toContain('f4.png (32×32)');
    expect(text('sequence-size')).toContain('Not 64×64');
    expect(text('sequence-summary')).toContain('64×64');

    await act(async () => {
      button('Continue').click();
    });
    const source = handedOn();
    // One frame per number 1…5: the gap (3) and the odd frame (4) both hold f2.
    expect(source.frames.map((f) => f.name)).toEqual([
      'f1.png',
      'f2.png',
      'f2.png',
      'f2.png',
      'f5.png',
    ]);
    expect(source).toMatchObject({
      kind: 'image-sequence',
      ext: 'png',
      fps: 25, // the PROJECT's channel rate, by default
      firstFile: 'f1.png',
      lastFile: 'f5.png',
      assetName: 'f.webm',
    });
  });

  it('a whole sequence reports no problem at all (the control)', async () => {
    await open([png('f1.png'), png('f2.png'), png('f3.png')]);
    expect(document.querySelector('[data-testid="sequence-problems"]')).toBeNull();
    expect(text('sequence-summary')).toContain('3 frames');
  });

  it('🔴 a folder holding TWO sequences lists both, largest first; the author picks one', async () => {
    await open([
      png('a_1.png', 64, 64, 'shot/a_1.png'),
      png('a_2.png', 64, 64, 'shot/a_2.png'),
      png('a_3.png', 64, 64, 'shot/a_3.png'),
      png('b_1.png', 64, 64, 'shot/b_1.png'),
      png('b_2.png', 64, 64, 'shot/b_2.png'),
    ]);
    const select = document.querySelector<HTMLSelectElement>('[data-testid="sequence-choice"]');
    expect(select).not.toBeNull();
    expect([...select!.options].map((o) => o.textContent)).toEqual([
      'shot/ a_1.png … a_3.png (3 frames)',
      'shot/ b_1.png … b_2.png (2 frames)',
    ]);
    await act(async () => {
      select!.value = '1';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(text('sequence-summary')).toContain('b_1.png … b_2.png');
    await act(async () => {
      button('Continue').click();
    });
    expect(handedOn().frames.map((f) => f.name)).toEqual(['b_1.png', 'b_2.png']);
  });

  it('the rate the author types is the one handed on', async () => {
    await open([png('f1.png'), png('f2.png')]);
    const rate = document.querySelector<HTMLInputElement>('input[aria-label="Frame rate"]');
    expect(rate).not.toBeNull();
    expect(Number(rate!.value)).toBe(25);
    act(() => {
      rate!.focus();
      const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setVal.call(rate, '30');
      rate!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      button('Continue').click();
    });
    expect(handedOn().fps).toBe(30);
  });

  it('a file that is not a numbered frame is left out and counted; a second file on a number is named', async () => {
    await open([png('f1.png'), png('f01.png'), png('f2.png'), png('notes.png')]);
    expect(text('sequence-ignored')).toContain('Left out: 1 file');
    expect(text('sequence-duplicates')).toContain('f01.png');
  });

  it('🔴 Cancel imports NOTHING', async () => {
    await open([png('f1.png'), png('f3.png')]);
    act(() => {
      button('Cancel').click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('🔴 B-345 — a ONE-frame sequence chosen from a pick is stated, and cannot continue into a one-frame video', async () => {
    await open([
      png('a_1.png', 64, 64, 'shot/a_1.png'),
      png('a_2.png', 64, 64, 'shot/a_2.png'),
      png('b_1.png', 64, 64, 'shot/b_1.png'),
    ]);
    // The two-frame sequence first: no fact, Continue open (the control).
    expect(document.querySelector('[data-testid="sequence-single"]')).toBeNull();
    expect(button('Continue').disabled).toBe(false);
    const select = document.querySelector<HTMLSelectElement>('[data-testid="sequence-choice"]');
    await act(async () => {
      select!.value = '1';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(text('sequence-single')).not.toBe('');
    expect(button('Continue').disabled).toBe(true);
    await act(async () => {
      button('Continue').click();
    });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('🔴 DELTA-I — a sequence over the convert budget is refused BEFORE it starts: one sentence, no Continue', async () => {
    // Three frames whose headers say 50000×50000: 7.5 Gpx, over the 3,000-frames-of-1080p budget.
    await open([
      png('big_1.png', 50_000, 50_000),
      png('big_2.png', 50_000, 50_000),
      png('big_3.png', 50_000, 50_000),
    ]);
    expect(text('sequence-too-large')).toMatch(
      /^3 frames of 50000×50000 are more than one import can convert in this browser: at most 2 at this size/,
    );
    expect(button('Continue').disabled).toBe(true);
    await act(async () => {
      button('Continue').click();
    });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('the control: the same three frames at 1920×1080 are well inside the budget', async () => {
    await open([
      png('ok_1.png', 1920, 1080),
      png('ok_2.png', 1920, 1080),
      png('ok_3.png', 1920, 1080),
    ]);
    expect(document.querySelector('[data-testid="sequence-too-large"]')).toBeNull();
    expect(button('Continue').disabled).toBe(false);
  });

  it('a sequence none of whose headers can be read cannot continue', async () => {
    const junk = (name: string): File => new File([new Uint8Array(40)], name);
    await open([junk('f1.png'), junk('f2.png')]);
    expect(text('sequence-unreadable')).toContain('f1.png');
    expect(button('Continue').disabled).toBe(true);
  });
});
