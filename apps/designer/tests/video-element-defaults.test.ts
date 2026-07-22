import { describe, expect, it } from 'vitest';
import { ElementSchema } from '@cg/shared-schema';
import { defaultVideo } from '../src/renderer/state/element-defaults.js';

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
