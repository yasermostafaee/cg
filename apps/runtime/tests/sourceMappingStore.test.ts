// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_SOURCE_MAPPINGS, type SourceMappings } from '@cg/shared-ipc';
import {
  __resetSourceMappingsForTest,
  commitSourceMappings,
  currentSourceMappings,
  initSourceMappings,
} from '../src/renderer/features/sources/sourceMappingStore.js';

/**
 * D-137 / C-015 phase 4 — the renderer's view of the BRIDGE-owned installation
 * mapping.
 *
 * Three properties, and each is the reason a specific mistake is not possible:
 *
 *  1. NO OPTIMISTIC UPDATE — a refused commit must leave the operator looking at
 *     what the station actually has, not at what they just typed. Believing a
 *     guest box is bound when it is not is the failure this prevents.
 *  2. AN EMPTY ANSWER IS HONOURED — unlike the delimiter list, where empty means
 *     a broken peer. Here empty is the un-configured station, and hiding it
 *     would be the same false belief by a different route.
 *  3. THE OLDER-BRIDGE TRANSLATION — every station whose bridge predates this
 *     feature meets `unknown channel`, so it is the common case, not an edge.
 */

interface FakeBridge {
  sources: {
    config: () => Promise<SourceMappings>;
    setConfig: (req: SourceMappings) => Promise<{ ok: boolean; message?: string; reason?: string }>;
    onConfigChanged: (handler: (m: SourceMappings) => void) => () => void;
  };
}

const guest1: SourceMappings = {
  mappings: [{ id: 'guest-1', producer: { kind: 'route', channel: 2 } }],
};

let stored: SourceMappings = EMPTY_SOURCE_MAPPINGS;
let refusal: { message?: string } | null = null;
let throwOnSet: Error | null = null;
let push: ((m: SourceMappings) => void) | null = null;
const setCalls: SourceMappings[] = [];

function installBridge(): FakeBridge {
  const bridge: FakeBridge = {
    sources: {
      config: () => Promise.resolve(stored),
      setConfig: (req) => {
        setCalls.push(req);
        if (throwOnSet !== null) return Promise.reject(throwOnSet);
        if (refusal !== null) return Promise.resolve({ ok: false, ...refusal });
        stored = req;
        return Promise.resolve({ ok: true });
      },
      onConfigChanged: (handler) => {
        push = handler;
        return () => {
          push = null;
        };
      },
    },
  };
  Object.defineProperty(globalThis, 'window', {
    value: { cg: bridge },
    configurable: true,
    writable: true,
  });
  return bridge;
}

describe('sourceMappingStore (bridge-owned)', () => {
  beforeEach(() => {
    stored = EMPTY_SOURCE_MAPPINGS;
    refusal = null;
    throwOnSet = null;
    push = null;
    setCalls.length = 0;
    __resetSourceMappingsForTest();
  });

  it('shows NOTHING before the bridge answers — there is no safe default to invent', () => {
    // The opposite of `delimiterStore`, deliberately: delimiters have a shipped
    // list, a mapping has none, and an invented one would say a source is bound
    // when the station has nothing.
    expect(currentSourceMappings()).toEqual({ mappings: [] });
  });

  it('adopts the STATION mapping, which is what makes it cross-console', async () => {
    const bridge = installBridge();
    stored = guest1;
    initSourceMappings(bridge);
    await Promise.resolve();
    await Promise.resolve();
    expect(currentSourceMappings()).toEqual(guest1);
  });

  it('honours an EMPTY answer, because the un-configured station is a real state', async () => {
    const bridge = installBridge();
    stored = guest1;
    initSourceMappings(bridge);
    await Promise.resolve();
    await Promise.resolve();
    expect(currentSourceMappings().mappings).toHaveLength(1);

    // The operator on another console removed the last mapping. Ignoring this
    // push would leave this console showing a binding the station no longer has.
    push?.({ mappings: [] });
    expect(currentSourceMappings()).toEqual({ mappings: [] });
  });

  it('does NOT adopt a refused commit', async () => {
    const bridge = installBridge();
    initSourceMappings(bridge);
    await Promise.resolve();
    refusal = { message: 'the Live Source layer band 50-75 overlaps …' };

    const err = await commitSourceMappings({
      mappings: [],
      layerRange: { start: 50, end: 75 },
    });

    expect(err).toContain('overlaps');
    // The cache is untouched: the operator is looking at what the station has.
    expect(currentSourceMappings()).toEqual({ mappings: [] });
    expect(setCalls).toHaveLength(1);
  });

  it('adopts an accepted commit', async () => {
    const bridge = installBridge();
    initSourceMappings(bridge);
    await Promise.resolve();

    expect(await commitSourceMappings(guest1)).toBeNull();
    expect(currentSourceMappings()).toEqual(guest1);
  });

  it('translates an older bridge, naming the real cause and offering no local fallback', async () => {
    const bridge = installBridge();
    initSourceMappings(bridge);
    await Promise.resolve();
    throwOnSet = new Error('unknown channel: sources.set-config');

    const message = await commitSourceMappings(guest1);

    expect(message).toMatch(/older than Live Source mapping/i);
    expect(message).toMatch(/restart it/i);
    // Saving locally is NOT offered: a private mapping this browser believes in
    // would still leave every take refusing.
    expect(currentSourceMappings()).toEqual({ mappings: [] });
  });

  it('survives a bridge that is down at boot, and is corrected by the first push', async () => {
    const bridge: FakeBridge = {
      sources: {
        config: () => Promise.reject(new Error('disconnected')),
        setConfig: () => Promise.reject(new Error('disconnected')),
        onConfigChanged: (handler) => {
          push = handler;
          return () => {
            push = null;
          };
        },
      },
    };
    initSourceMappings(bridge);
    await Promise.resolve();
    await Promise.resolve();
    expect(currentSourceMappings()).toEqual({ mappings: [] });

    push?.(guest1);
    expect(currentSourceMappings()).toEqual(guest1);
  });
});
