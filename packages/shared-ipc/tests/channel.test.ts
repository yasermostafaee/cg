import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  type Channel,
  type ChannelRequest,
  type ChannelResponse,
  defineChannel,
} from '../src/channel.js';

describe('defineChannel', () => {
  it('bundles name + schemas', () => {
    const c = defineChannel('hello.greet', z.object({ n: z.string() }), z.string());
    expect(c.name).toBe('hello.greet');
    expect(c.request.parse({ n: 'world' })).toEqual({ n: 'world' });
    expect(c.response.parse('hi')).toBe('hi');
  });

  it('exposes the response schema for parse failures', () => {
    const c = defineChannel('x.y', z.void(), z.number());
    expect(() => c.response.parse('not-a-number')).toThrow();
  });
});

describe('Channel type inference', () => {
  it('ChannelRequest / ChannelResponse infer correctly', () => {
    const c = defineChannel(
      't',
      z.object({ name: z.string() }),
      z.object({ count: z.number() }),
    );
    // Runtime sanity (also makes `c` non-unused for the linter)
    expect(c.name).toBe('t');
    type ChannelType = typeof c;
    expectTypeOf<ChannelRequest<ChannelType>>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<ChannelResponse<ChannelType>>().toEqualTypeOf<{ count: number }>();
  });

  it('accepts a void request', () => {
    const c: Channel<z.ZodVoid, z.ZodString> = defineChannel('t', z.void(), z.string());
    expect(c.request.safeParse(undefined).success).toBe(true);
  });
});
