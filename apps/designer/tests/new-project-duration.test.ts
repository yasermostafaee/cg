import { describe, expect, it } from 'vitest';
import {
  normalizeProjectFrames,
  projectFramesFromSeconds,
  projectSecondsFromFrames,
} from '../src/renderer/features/shell/new-project-duration.js';

describe('D-183 — New Project duration conversion', () => {
  it('turns ten seconds at 50 fps into 500 frames', () => {
    expect(projectFramesFromSeconds(10, 50)).toBe(500);
    expect(projectSecondsFromFrames(500, 50)).toBe(10);
  });

  it('turns ten seconds at 30 fps into exactly 300 frames', () => {
    expect(projectFramesFromSeconds(10, 30)).toBe(300);
    expect(projectSecondsFromFrames(300, 30)).toBe(10);
  });

  it('turns a frame edit back into seconds', () => {
    expect(projectSecondsFromFrames(125, 50)).toBe(2.5);
  });

  it('snaps fractional rates to a whole frame and reports its actual duration', () => {
    const frames = projectFramesFromSeconds(10, 29.97);
    expect(frames).toBe(300);
    expect(projectSecondsFromFrames(frames, 29.97)).toBe(10.01);
  });

  it('never creates a zero, fractional or non-finite frame count', () => {
    expect(normalizeProjectFrames(0)).toBe(1);
    expect(normalizeProjectFrames(1.6)).toBe(2);
    expect(normalizeProjectFrames(Number.NaN)).toBe(1);
    expect(projectFramesFromSeconds(0, 50)).toBe(1);
  });
});
