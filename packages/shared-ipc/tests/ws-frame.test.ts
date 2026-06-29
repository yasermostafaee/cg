import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_BRIDGE_WS_URL,
  WsFrameSchema,
  parseWsFrame,
  serializeWsFrame,
  type WsFrame,
} from '../src/ws-frame.js';

describe('ws-frame envelope', () => {
  it('round-trips each frame kind through serialize → parse', () => {
    const frames: WsFrame[] = [
      { type: 'request', id: '1', channel: 'stack.take', payload: { itemId: 'a' } },
      { type: 'response', id: '1', payload: { accepted: true } },
      { type: 'response', id: '2', error: { message: 'boom' } },
      { type: 'publish', channel: 'stack.state-changed', payload: [] },
    ];
    for (const frame of frames) {
      expect(parseWsFrame(serializeWsFrame(frame))).toEqual(frame);
    }
  });

  it('returns null for non-JSON input', () => {
    expect(parseWsFrame('not json {')).toBeNull();
  });

  it('returns null for a JSON value that is not a valid frame', () => {
    expect(parseWsFrame(JSON.stringify({ type: 'nope' }))).toBeNull();
    expect(parseWsFrame(JSON.stringify({ type: 'request' }))).toBeNull(); // missing id/channel
    expect(parseWsFrame(JSON.stringify(42))).toBeNull();
  });

  it('discriminates on `type`', () => {
    const req = WsFrameSchema.safeParse({
      type: 'request',
      id: 'x',
      channel: 'c',
      payload: 1,
    });
    expect(req.success).toBe(true);
  });

  it('exposes browser-safe bridge endpoint defaults', () => {
    expect(DEFAULT_BRIDGE_HOST).toBe('127.0.0.1');
    expect(DEFAULT_BRIDGE_PORT).toBe(5280);
    expect(DEFAULT_BRIDGE_WS_URL).toBe('ws://127.0.0.1:5280');
  });
});
