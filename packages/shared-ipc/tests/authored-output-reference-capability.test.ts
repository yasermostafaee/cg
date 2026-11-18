import { describe, expect, it } from 'vitest';
import { BridgeCapabilitiesChannel } from '../src/channels/capabilities.js';

describe('authored output reference capability', () => {
  it('does not infer support from an old Bridge response', () => {
    expect(
      BridgeCapabilitiesChannel.response.parse({ channels: [] }).authoredOutputReference,
    ).toBeUndefined();
    expect(
      BridgeCapabilitiesChannel.response.parse({ channels: [], authoredOutputReference: true })
        .authoredOutputReference,
    ).toBe(true);
    expect(
      BridgeCapabilitiesChannel.response.safeParse({ channels: [], authoredOutputReference: false })
        .success,
    ).toBe(false);
  });
});
