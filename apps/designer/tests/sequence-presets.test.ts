import { describe, expect, it } from 'vitest';
import {
  SEQUENCE_PRESET_ORDER,
  SEQUENCE_TRANSITION_PRESETS,
  sequencePresetKeyFor,
} from '../src/renderer/features/inspector/sequence-presets.js';

describe('sequence transition presets (D-029)', () => {
  it('Push ×4 are simultaneous with opposite edges; Slide ×4 sequential; Hide-show none/none', () => {
    expect(SEQUENCE_TRANSITION_PRESETS['push-up']).toEqual({
      transitionIn: 'bottom',
      transitionOut: 'top',
      transitionTiming: 'simultaneous',
    });
    expect(SEQUENCE_TRANSITION_PRESETS['slide-left']).toEqual({
      transitionIn: 'right',
      transitionOut: 'left',
      transitionTiming: 'sequential',
    });
    expect(SEQUENCE_TRANSITION_PRESETS['hide-show']).toEqual({
      transitionIn: 'none',
      transitionOut: 'none',
      transitionTiming: 'simultaneous',
    });
    for (const key of ['push-up', 'push-down', 'push-left', 'push-right'])
      expect(SEQUENCE_TRANSITION_PRESETS[key]?.transitionTiming).toBe('simultaneous');
    for (const key of ['slide-up', 'slide-down', 'slide-left', 'slide-right'])
      expect(SEQUENCE_TRANSITION_PRESETS[key]?.transitionTiming).toBe('sequential');
  });

  it('every preset round-trips through the matcher (select shows what it wrote)', () => {
    for (const [key, fields] of Object.entries(SEQUENCE_TRANSITION_PRESETS)) {
      expect(sequencePresetKeyFor(fields)).toBe(key);
    }
  });

  it('a field combination matching no preset displays Custom', () => {
    expect(
      sequencePresetKeyFor({
        transitionIn: 'left',
        transitionOut: 'left', // same-edge push — not a named preset
        transitionTiming: 'simultaneous',
      }),
    ).toBe('custom');
    expect(
      sequencePresetKeyFor({
        transitionIn: 'bottom',
        transitionOut: 'top',
        transitionTiming: 'sequential', // push edges + slide timing = slide-up
      }),
    ).toBe('slide-up');
  });

  it('hide-show matches on the two none edges regardless of timing', () => {
    expect(
      sequencePresetKeyFor({
        transitionIn: 'none',
        transitionOut: 'none',
        transitionTiming: 'sequential',
      }),
    ).toBe('hide-show');
  });

  it('the dropdown order covers every preset exactly once, plus custom', () => {
    const keys = SEQUENCE_PRESET_ORDER.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of Object.keys(SEQUENCE_TRANSITION_PRESETS)) expect(keys).toContain(key);
    expect(keys).toContain('custom');
  });
});
