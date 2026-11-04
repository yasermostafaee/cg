import { describe, expect, it } from 'vitest';
import { acceptAttr, isSupportedFile } from '../src/shared/asset-types.js';
import {
  decodeFailureMessage,
  unsupportedVideoSelectionMessage,
} from '../src/renderer/features/assets/video-import-policy.js';

describe('D-190 — immediate video-container policy and actionable guidance', () => {
  const accepted = [
    'mp4',
    'webm',
    'avi',
    'mov',
    'mkv',
    'mpg',
    'mpeg',
    'wmv',
    'flv',
    'm4v',
    'ts',
    'mts',
    'm2ts',
    '3gp',
    'ogv',
  ];

  it('accepts the explicit container list case-insensitively and refuses unknown named extensions', () => {
    for (const ext of accepted) {
      expect(isSupportedFile('video', { name: `clip.${ext.toUpperCase()}` })).toBe(true);
    }
    expect(isSupportedFile('video', { name: 'clip.mxf', type: 'video/quicktime' })).toBe(false);
    expect(isSupportedFile('video', { name: 'clip.exe', type: 'video/mp4' })).toBe(false);
    expect(isSupportedFile('video', { name: 'extensionless', type: 'video/quicktime' })).toBe(true);
  });

  it('keeps the native hint aligned with that explicit list', () => {
    const hint = acceptAttr('video');
    expect(hint).not.toContain('video/*');
    for (const ext of accepted) expect(hint.split(',')).toContain(`.${ext}`);
  });

  it('refusals name both opaque and transparency-safe re-export routes', () => {
    expect(unsupportedVideoSelectionMessage(['clip.mxf'])).toMatch(/H\.264.*QTRLE.*PNG sequence/);
    expect(decodeFailureMessage('clip.mov')).toMatch(/first frame.*H\.264.*QTRLE/s);
  });
});
