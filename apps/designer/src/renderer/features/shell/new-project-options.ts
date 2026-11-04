import type { FrameRate, Resolution } from '@cg/shared-schema';

export type ProjectResolutionPresetKey = 'fhd' | 'hd' | 'square-fhd' | 'custom';

export interface ProjectResolutionPreset {
  key: ProjectResolutionPresetKey;
  label: string;
  width: number;
  height: number;
}

/**
 * Square-pixel canvas footprints that fit the current 1920x1080 authoring reference.
 * UHD/QHD/portrait are deliberately omitted: a larger or taller full-frame output needs a
 * separate output-reference contract. SD broadcast rasters also require pixel-aspect metadata.
 */
export const PROJECT_RESOLUTION_PRESETS: readonly ProjectResolutionPreset[] = [
  {
    key: 'fhd',
    label: '1920 × 1080 — Full HD reference (16:9)',
    width: 1920,
    height: 1080,
  },
  { key: 'hd', label: '1280 × 720 — Small canvas (16:9)', width: 1280, height: 720 },
  { key: 'square-fhd', label: '1080 × 1080 — Square canvas', width: 1080, height: 1080 },
  { key: 'custom', label: 'Custom', width: 0, height: 0 },
];

export const DEFAULT_PROJECT_RESOLUTION_PRESET: ProjectResolutionPresetKey = 'fhd';

export const PROJECT_FRAME_RATES: readonly FrameRate[] = [25, 29.97, 30, 50, 59.94, 60];

export function projectResolution(
  presetKey: ProjectResolutionPresetKey,
  customWidth: number,
  customHeight: number,
): Resolution {
  if (presetKey === 'custom') {
    return {
      width: Math.max(1, Math.round(customWidth)),
      height: Math.max(1, Math.round(customHeight)),
    };
  }

  const preset = PROJECT_RESOLUTION_PRESETS.find((candidate) => candidate.key === presetKey);
  if (preset === undefined) {
    throw new Error(`Unknown project resolution preset: ${presetKey}`);
  }
  return { width: preset.width, height: preset.height };
}
