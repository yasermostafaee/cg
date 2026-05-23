import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineChannel } from '../src/channel.js';
import { type IpcHandler, handle } from '../src/handle.js';

/**
 * Fake Electron ipcMain: stores listeners by channel name and exposes
 * `dispatch` to invoke them, just like a real renderer→main round-trip.
 */
function makeMain(): IpcHandler & {
  dispatch(channel: string, payload: unknown): Promise<unknown>;
} {
  const listeners = new Map<
    string,
    (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  >();
  return {
    handle(channel, listener) {
      listeners.set(channel, listener);
    },
    async dispatch(channel, payload) {
      const l = listeners.get(channel);
      if (!l) throw new Error(`No handler for ${channel}`);
      return l({}, payload);
    },
  };
}

const Sum = defineChannel(
  'math.sum',
  z.object({ a: z.number(), b: z.number() }),
  z.object({ total: z.number() }),
);

describe('handle', () => {
  it('registers a validated handler that round-trips', async () => {
    const main = makeMain();
    handle(main, Sum, ({ a, b }) => ({ total: a + b }));
    const res = await main.dispatch('math.sum', { a: 1, b: 2 });
    expect(res).toEqual({ total: 3 });
  });

  it('rejects an invalid request on the way in', async () => {
    const main = makeMain();
    handle(main, Sum, () => ({ total: 0 }));
    await expect(main.dispatch('math.sum', { a: 'one', b: 2 })).rejects.toThrow();
  });

  it('rejects an invalid response on the way out', async () => {
    const main = makeMain();
    handle(main, Sum, () => ({ total: 'three' as unknown as number }));
    await expect(main.dispatch('math.sum', { a: 1, b: 2 })).rejects.toThrow();
  });

  it('awaits async handlers', async () => {
    const main = makeMain();
    handle(main, Sum, async ({ a, b }) => {
      await Promise.resolve();
      return { total: a + b };
    });
    const res = await main.dispatch('math.sum', { a: 3, b: 4 });
    expect(res).toEqual({ total: 7 });
  });
});
