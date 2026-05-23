import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  definePublishChannel,
  type IpcPublisher,
  type IpcSubscriber,
  publish,
  subscribe,
} from '../src/publish.js';

const Tick = definePublishChannel('tick', z.object({ at: z.number(), count: z.number() }));

describe('publish / subscribe', () => {
  it('parses the payload before sending and after receiving', () => {
    const publisher: IpcPublisher = { send: vi.fn() };
    publish(publisher, Tick, { at: 1, count: 2 });
    expect(publisher.send).toHaveBeenCalledWith('tick', { at: 1, count: 2 });
  });

  it('throws on invalid publish payload (before send)', () => {
    const publisher: IpcPublisher = { send: vi.fn() };
    expect(() =>
      // @ts-expect-error — wrong shape
      publish(publisher, Tick, { at: 'not-a-number', count: 0 }),
    ).toThrow();
    expect(publisher.send).not.toHaveBeenCalled();
  });

  it('subscribe receives validated payloads', () => {
    let handler: ((event: unknown, payload: unknown) => void) | null = null;
    const subscriber: IpcSubscriber = {
      on: vi.fn((_channel, listener) => {
        handler = listener;
      }),
      off: vi.fn(),
    };
    const got: { at: number; count: number }[] = [];
    subscribe(subscriber, Tick, (payload) => got.push(payload));
    handler!(null, { at: 5, count: 6 });
    expect(got).toEqual([{ at: 5, count: 6 }]);
  });

  it('subscribe swallows malformed payloads via onError', () => {
    let handler: ((event: unknown, payload: unknown) => void) | null = null;
    const subscriber: IpcSubscriber = {
      on: vi.fn((_channel, listener) => {
        handler = listener;
      }),
      off: vi.fn(),
    };
    const errors: unknown[] = [];
    const got: unknown[] = [];
    subscribe(
      subscriber,
      Tick,
      (p) => got.push(p),
      (e) => errors.push(e),
    );
    handler!(null, { at: 'nope' });
    expect(got).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('subscribe returns an unsubscribe function that calls off()', () => {
    const subscriber: IpcSubscriber = {
      on: vi.fn(),
      off: vi.fn(),
    };
    const unsubscribe = subscribe(subscriber, Tick, () => undefined);
    unsubscribe();
    expect(subscriber.off).toHaveBeenCalledWith('tick', expect.any(Function));
  });

  it('malformed payload with no onError is silently dropped (no throw)', () => {
    let handler: ((event: unknown, payload: unknown) => void) | null = null;
    const subscriber: IpcSubscriber = {
      on: vi.fn((_channel, listener) => {
        handler = listener;
      }),
      off: vi.fn(),
    };
    subscribe(subscriber, Tick, () => undefined);
    expect(() => handler!(null, { at: 'nope' })).not.toThrow();
  });
});
