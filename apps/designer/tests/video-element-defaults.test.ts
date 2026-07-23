import { describe, expect, it } from 'vitest';
import { ElementSchema } from '@cg/shared-schema';
import { defaultVideo, fitVideoElement } from '../src/renderer/state/element-defaults.js';

/**
 * D-128 Phase 2 — the `defaultVideo` factory produces a schema-valid element
 * that round-trips through save/load (JSON) with its assetId intact — the shape
 * both entry points (import-modal place-on-confirm, drag-from-assets drop) commit.
 */
describe('defaultVideo (D-128)', () => {
  it('is schema-valid and round-trips through JSON save/load with assetId intact', () => {
    const el = defaultVideo('el-1', 960, 540, 'asset-clip', 4000, { width: 640, height: 480 });
    const parsed = ElementSchema.parse(JSON.parse(JSON.stringify(el)) as unknown);
    expect(parsed).toEqual(el);
    expect(parsed.type).toBe('video');
    if (parsed.type === 'video') {
      expect(parsed.assetId).toBe('asset-clip');
      expect(parsed.durationMs).toBe(4000);
      expect(parsed.holdBehavior).toBe('loop'); // the inverse-of-Lottie default
      expect(parsed.drivesHold).toBeUndefined(); // absent ⇒ does NOT drive
      expect(parsed.transform.size).toEqual({ w: 640, h: 480 });
    }
  });

  it('defaults to a 480×270 box when dimensions are unknown', () => {
    const el = defaultVideo('el-2', 0, 0, 'asset-clip', 1600);
    expect(el.transform.size).toEqual({ w: 480, h: 270 });
  });
});

/**
 * D-128 field bug — a clip DRAGGED from the assets panel landed at 1/4 the size
 * of the same clip placed from the import modal, because the drag path sized via
 * a 480px-longest-side cap (`lottieSize`) while the modal fit to the project
 * frame. Both entry points now go through the SHARED {@link fitVideoElement}, so
 * they can never diverge again: the element takes the clip's INTRINSIC size,
 * scaled DOWN only to fit inside the frame, independent of canvas zoom.
 */
describe('fitVideoElement — one sizing seam for both entry points (D-128)', () => {
  const HD = { width: 1920, height: 1080 };

  it("the owner's 1920×282 clip fits the frame at FULL size — NOT the old 480×71 quarter", () => {
    const el = fitVideoElement({
      id: 'el-1',
      x: 960,
      y: 540,
      assetId: 'asset-lower',
      durationMs: 4000,
      sourceWidth: 1920,
      sourceHeight: 282,
      resolution: HD,
    });
    expect(el.transform.size).toEqual({ w: 1920, h: 282 });
    // regression guard: the 480px longest-side cap (lottieSize) would give this
    expect(el.transform.size).not.toEqual({ w: 480, h: 71 });
  });

  it('the DRAG path and the MODAL path yield an identical-sized element for the same asset (only position differs)', () => {
    const common = {
      assetId: 'asset-clip',
      durationMs: 4000,
      sourceWidth: 1920,
      sourceHeight: 282,
      resolution: HD,
    };
    // modal: place-on-confirm at the scene centre
    const fromModal = fitVideoElement({ id: 'a', x: 960, y: 540, ...common });
    // drag: dropped at an arbitrary point on a canvas at ANY zoom (zoom never
    // enters this seam — the drop point is in SCENE px, not screen px)
    const fromDrag = fitVideoElement({ id: 'b', x: 137, y: 42, ...common });
    expect(fromDrag.transform.size).toEqual(fromModal.transform.size);
    expect(fromModal.transform.size).toEqual({ w: 1920, h: 282 });
    // sizing depends only on source + resolution, so the two drop points still
    // agree on size while differing on position
    expect(fromDrag.transform.position).not.toEqual(fromModal.transform.position);
  });

  it('a source LARGER than the frame is scaled down to fit (aspect preserved)', () => {
    const el = fitVideoElement({
      id: 'el-4k',
      x: 0,
      y: 0,
      assetId: 'asset-4k',
      durationMs: 1000,
      sourceWidth: 3840,
      sourceHeight: 2160,
      resolution: HD,
    });
    expect(el.transform.size).toEqual({ w: 1920, h: 1080 }); // fit 0.5, ratio kept
  });

  it('a source SMALLER than the frame keeps its intrinsic size (never upscaled)', () => {
    const el = fitVideoElement({
      id: 'el-sm',
      x: 0,
      y: 0,
      assetId: 'asset-sm',
      durationMs: 1000,
      sourceWidth: 100,
      sourceHeight: 100,
      resolution: HD,
    });
    expect(el.transform.size).toEqual({ w: 100, h: 100 }); // fit capped at 1×
  });

  it('falls back to the 480×270 box when the source dimensions are unknown', () => {
    const el = fitVideoElement({
      id: 'el-0',
      x: 0,
      y: 0,
      assetId: 'asset-novid',
      durationMs: 1000,
      sourceWidth: 0,
      sourceHeight: 0,
      resolution: HD,
    });
    expect(el.transform.size).toEqual({ w: 480, h: 270 });
  });
});
