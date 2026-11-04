import { describe, expect, it } from 'vitest';

import {
  contentStartDefaultFrom,
  holdStartSeedFrom,
} from '../src/renderer/features/inspector/content-start-default.js';

describe('D-188 Hold-start seed', () => {
  it('keeps marker-less runtime at Outro start but seeds explicit Set one frame earlier', () => {
    expect(contentStartDefaultFrom([], 0, 80)).toBe(80);
    expect(holdStartSeedFrom([], 0, 80)).toBe(79);
  });

  it('does not invent a frame when the active range has no room', () => {
    expect(contentStartDefaultFrom([], 80, 80)).toBe(80);
    expect(holdStartSeedFrom([], 80, 80)).toBe(80);
  });
});
