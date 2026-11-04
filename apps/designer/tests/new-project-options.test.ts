import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_RESOLUTION_PRESET,
  PROJECT_FRAME_RATES,
  PROJECT_RESOLUTION_PRESETS,
  projectResolution,
} from '../src/renderer/features/shell/new-project-options.js';

describe('D-192 — New Project formats', () => {
  it('offers the reference-safe square-pixel footprints plus Custom', () => {
    expect(PROJECT_RESOLUTION_PRESETS).toEqual([
      expect.objectContaining({ key: 'fhd', width: 1920, height: 1080 }),
      expect.objectContaining({ key: 'hd', width: 1280, height: 720 }),
      expect.objectContaining({ key: 'square-fhd', width: 1080, height: 1080 }),
      expect.objectContaining({ key: 'custom', width: 0, height: 0 }),
    ]);
    expect(DEFAULT_PROJECT_RESOLUTION_PRESET).toBe('fhd');
  });

  it('does not promise output formats the fixed reference cannot represent safely', () => {
    expect(PROJECT_RESOLUTION_PRESETS).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 3840, height: 2160 }),
        expect.objectContaining({ width: 2560, height: 1440 }),
        expect.objectContaining({ width: 1080, height: 1920 }),
        expect.objectContaining({ width: 720, height: 576 }),
        expect.objectContaining({ width: 720, height: 486 }),
        expect.objectContaining({ width: 720, height: 480 }),
      ]),
    );
  });

  it('offers 30 fps alongside the existing frame rates', () => {
    expect(PROJECT_FRAME_RATES).toEqual([25, 29.97, 30, 50, 59.94, 60]);
  });

  it('resolves presets and clamps a custom raster to positive integer pixels', () => {
    expect(projectResolution('hd', 1, 1)).toEqual({ width: 1280, height: 720 });
    expect(projectResolution('custom', 1000.6, 0)).toEqual({ width: 1001, height: 1 });
  });
});
