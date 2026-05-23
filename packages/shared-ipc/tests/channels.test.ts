import { describe, expect, it } from 'vitest';
import { AppInfoChannel } from '../src/channels/common.js';

describe('AppInfoChannel', () => {
  it('has the conventional name', () => {
    expect(AppInfoChannel.name).toBe('app.info');
  });

  it('accepts void request', () => {
    expect(AppInfoChannel.request.safeParse(undefined).success).toBe(true);
  });

  it('validates a real response', () => {
    expect(
      AppInfoChannel.response.parse({
        name: 'cg-designer',
        version: '0.0.0',
        platform: 'win32',
      }),
    ).toEqual({ name: 'cg-designer', version: '0.0.0', platform: 'win32' });
  });

  it('rejects an empty platform', () => {
    expect(() =>
      AppInfoChannel.response.parse({ name: 'x', version: 'y', platform: '' }),
    ).toThrow();
  });
});
