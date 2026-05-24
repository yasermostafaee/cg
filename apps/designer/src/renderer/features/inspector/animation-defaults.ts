import type { EntryPreset, ExitPreset, LoopPreset } from '@cg/shared-schema';

/**
 * Factory defaults for each preset kind. The Animation Inspector swaps
 * the whole sub-object when the operator changes a preset's `kind` so
 * Zod-required fields are always present on commit.
 */

const DEFAULT_EASING = 'power2.out' as const;
const DEFAULT_DURATION = 15; // ~0.5s at 30fps; sane default per Phase 3 §5
const DEFAULT_DELAY = 0;

export function defaultEntry(kind: EntryPreset['kind']): EntryPreset {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'fade':
      return {
        kind: 'fade',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
      };
    case 'slide':
      return {
        kind: 'slide',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
        direction: 'left',
        distance: 300,
      };
    case 'scale':
      return {
        kind: 'scale',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
        from: 0.6,
      };
    case 'blur':
      return {
        kind: 'blur',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
        from: 12,
      };
  }
}

export function defaultExit(kind: ExitPreset['kind']): ExitPreset {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'fade-out':
      return {
        kind: 'fade-out',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
      };
    case 'slide-out':
      return {
        kind: 'slide-out',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
        direction: 'right',
        distance: 300,
      };
    case 'scale-down':
      return {
        kind: 'scale-down',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
        to: 0.6,
      };
    case 'blur-out':
      return {
        kind: 'blur-out',
        duration: DEFAULT_DURATION,
        delay: DEFAULT_DELAY,
        easing: DEFAULT_EASING,
        to: 12,
      };
  }
}

export function defaultLoop(kind: LoopPreset['kind']): LoopPreset {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'ticker':
      return { kind: 'ticker', speed: 120, direction: 'rtl' };
    case 'pulse':
      return { kind: 'pulse', duration: 60, minOpacity: 0.5, maxOpacity: 1 };
    case 'breathing':
      return { kind: 'breathing', duration: 90, scaleMin: 0.95, scaleMax: 1.05 };
  }
}

/** Total visible duration (frames) of an entry/exit preset, for the timeline strip. */
export function presetDuration(preset: EntryPreset | ExitPreset | undefined): number {
  if (preset === undefined || preset.kind === 'none') return 0;
  return preset.duration + preset.delay;
}
