import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineChannel } from '../src/channel.js';
import { type IpcInvoker, invoke } from '../src/invoke.js';

const Greet = defineChannel(
  'hello.greet',
  z.object({ name: z.string() }),
  z.object({ message: z.string() }),
);

function makeInvoker(impl: (channel: string, payload: unknown) => unknown): IpcInvoker {
  return {
    invoke: vi.fn(async (channel: string, ...args: unknown[]) => impl(channel, args[0])),
  };
}

describe('invoke', () => {
  it('validates the request, sends, and parses the response', async () => {
    const invoker = makeInvoker((channel, payload) => {
      expect(channel).toBe('hello.greet');
      expect(payload).toEqual({ name: 'world' });
      return { message: 'hi, world' };
    });
    const res = await invoke(invoker, Greet, { name: 'world' });
    expect(res).toEqual({ message: 'hi, world' });
  });

  it('throws on an invalid request before sending', async () => {
    const invoker = makeInvoker(() => {
      throw new Error('should not be called');
    });
    await expect(
      // @ts-expect-error — deliberately wrong shape
      invoke(invoker, Greet, { wrongKey: 1 }),
    ).rejects.toThrow();
    expect(invoker.invoke).not.toHaveBeenCalled();
  });

  it('throws on an invalid response from the wire', async () => {
    const invoker = makeInvoker(() => ({ messageWrong: 'oops' }));
    await expect(invoke(invoker, Greet, { name: 'world' })).rejects.toThrow();
  });

  it('forwards arbitrary IpcInvoker shapes', async () => {
    const echo: IpcInvoker = {
      invoke: async (_channel, ...args) => ({
        message: `echo:${(args[0] as { name: string }).name}`,
      }),
    };
    const res = await invoke(echo, Greet, { name: 'sarah' });
    expect(res.message).toBe('echo:sarah');
  });
});
