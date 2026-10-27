import { afterEach, describe, expect, it } from 'vitest';
import type { DynamicField } from '@cg/shared-schema';
import {
  applyDesignerFileSourcePreviews,
  dismissDesignerFileSourcePreview,
  getDesignerFileSourcePreview,
  isDesignerFixedFileIntent,
  isDesignerFileSourcePreviewOpen,
  requestDesignerFileSourcePreviewOpen,
  resetDesignerFileSourcePreviewsForTest,
  setDesignerFileSourcePreview,
  setDesignerFixedFileIntent,
} from '../src/renderer/features/fields/fileSourcePreviewStore.js';

const field: DynamicField = {
  id: 'headlines',
  type: 'list',
  label: 'Headlines',
  required: true,
  default: [{ id: 'old-1', text: 'old authored item' }],
  fileSource: { bridgePath: 'news.txt', delimiter: '\n' },
};

afterEach(resetDesignerFileSourcePreviewsForTest);

describe('Designer selected-file preview session', () => {
  it('keeps bytes and the display path for every Designer surface', () => {
    const value = [{ id: 'file-1', text: 'current file item' }];
    setDesignerFileSourcePreview({
      sceneId: 'scene-1',
      fieldId: 'headlines',
      bridgePath: 'news.txt',
      displayPath: String.raw`\\newsroom\shared\news.txt`,
      content: 'current file item',
      value,
    });

    expect(getDesignerFileSourcePreview('scene-1', 'headlines', 'news.txt')).toMatchObject({
      displayPath: String.raw`\\newsroom\shared\news.txt`,
      content: 'current file item',
    });
    expect(
      applyDesignerFileSourcePreviews('scene-1', [field], { headlines: field.default }),
    ).toEqual({ headlines: value });
  });

  it('never applies stale bytes after the authored Bridge path changes', () => {
    setDesignerFileSourcePreview({
      sceneId: 'scene-1',
      fieldId: 'headlines',
      bridgePath: 'old.txt',
      displayPath: 'old.txt',
      content: 'stale',
      value: [{ id: 'file-1', text: 'stale' }],
    });

    expect(getDesignerFileSourcePreview('scene-1', 'headlines', 'news.txt')).toBeNull();
    expect(
      applyDesignerFileSourcePreviews('scene-1', [field], { headlines: field.default }),
    ).toEqual({ headlines: field.default });
  });

  it('keeps an open-modal request through the fixed-field render transition until dismissed', () => {
    requestDesignerFileSourcePreviewOpen('scene-1', 'headlines');
    expect(isDesignerFileSourcePreviewOpen('scene-1', 'headlines')).toBe(true);
    dismissDesignerFileSourcePreview('scene-1', 'headlines');
    expect(isDesignerFileSourcePreviewOpen('scene-1', 'headlines')).toBe(false);
  });

  it('keeps the pre-selection fixed-file checkbox intent in the Designer session', () => {
    setDesignerFixedFileIntent('scene-1', 'ticker-1', true);
    expect(isDesignerFixedFileIntent('scene-1', 'ticker-1')).toBe(true);
    setDesignerFixedFileIntent('scene-1', 'ticker-1', false);
    expect(isDesignerFixedFileIntent('scene-1', 'ticker-1')).toBe(false);
  });
});
