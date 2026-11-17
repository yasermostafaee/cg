// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourcePresenceView } from '@cg/shared-ipc';
import { useSourcePresence } from '../src/renderer/hooks/useSourcePresence.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

type Read = NonNullable<RuntimeBridge['sources']['presence']>;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function bridgeStub(
  read: Read,
  supported = true,
): {
  changeConfig(): void;
  disconnect(nextAddress?: string): void;
} {
  const config = new Set<() => void>();
  const link = new Set<() => void>();
  let status = 'live';
  let address = 'primary.example.test:5280';
  const bridge = {
    sources: { presence: read },
    link: {
      status: () => status,
      bridgeAddress: () => address,
      onStatusChanged: (handler: () => void) => {
        link.add(handler);
        return () => link.delete(handler);
      },
    },
    auth: {
      state: () => ({ kind: 'off' }),
      onStateChanged: () => () => undefined,
      capabilities: () => (supported ? { sourcePresence: true } : {}),
      onCapabilitiesChanged: () => () => undefined,
    },
    connections: {
      onConfigChanged: (handler: () => void) => {
        config.add(handler);
        return () => config.delete(handler);
      },
    },
  };
  vi.stubGlobal('cg', bridge);
  return {
    changeConfig: () => config.forEach((handler) => handler()),
    disconnect: (nextAddress) => {
      status = 'disconnected';
      if (nextAddress !== undefined) address = nextAddress;
      link.forEach((handler) => handler());
    },
  };
}

function Watch({ ids }: { ids: readonly string[] }): JSX.Element {
  const view = useSourcePresence(1, ids);
  return createElement('output', {}, JSON.stringify(view));
}

async function watch(...groups: readonly string[][]): Promise<void> {
  await act(async () => {
    root.render(groups.map((ids, index) => createElement(Watch, { key: index, ids })));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const GOOD: SourcePresenceView = {
  engines: ['A', 'B'],
  sources: { 'in-studio': { B: 'present' } },
};

describe('source presence subscriptions', () => {
  it('coalesces mounted same-channel requests, deduplicates IDs, and bounds each batch', async () => {
    const read = vi.fn<Read>((req) =>
      Promise.resolve({
        engines: ['A', 'B'],
        sources: Object.fromEntries(req.sourceIds.map((id) => [id, { B: 'present' }])),
      }),
    );
    bridgeStub(read);
    const media = Array.from({ length: 65 }, (_, i) => `md-item-${String(i)}`);
    await watch(['in-studio', media[0]!, 'invalid id'], media, ['in-studio']);
    await advance(0);
    expect(read.mock.calls.map(([req]) => req.sourceIds.length)).toEqual([64, 2]);
    expect(new Set(read.mock.calls.flatMap(([req]) => req.sourceIds)).size).toBe(66);
    expect(host.querySelector('output')?.textContent).toContain('"in-studio":{"B":"present"}');
  });

  it('shows unknown on a disconnect and forgets B when the console is pointed at another Bridge', async () => {
    const read = vi.fn<Read>(() => Promise.resolve(GOOD));
    const bridge = bridgeStub(read);
    await watch(['in-studio']);
    await advance(0);
    expect(host.textContent).toBe(JSON.stringify(GOOD));
    await act(async () => bridge.disconnect());
    expect(host.textContent).toBe(JSON.stringify({ engines: ['A', 'B'], sources: {} }));
    await advance(15_000);
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => bridge.disconnect('another.example.test:5280'));
    expect(host.textContent).toBe('null');
  });

  it('discards in-flight results from the previous server configuration', async () => {
    let resolvePrevious: (value: SourcePresenceView) => void = () => undefined;
    const read = vi
      .fn<Read>(() => Promise.resolve(GOOD))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePrevious = resolve;
          }),
      );
    const bridge = bridgeStub(read);
    await watch(['in-studio']);
    await advance(0);
    await act(async () => bridge.changeConfig());
    expect(host.textContent).toBe('null');
    await advance(0);
    expect(host.textContent).toBe(JSON.stringify(GOOD));
    await act(async () => {
      resolvePrevious({ ...GOOD, sources: { 'in-studio': { B: 'missing' } } });
    });
    expect(host.textContent).toBe(JSON.stringify(GOOD));
  });

  it('skips badges and recurring requests on a single-engine station', async () => {
    const read = vi.fn<Read>(() => Promise.resolve({ engines: ['A'], sources: {} }));
    bridgeStub(read);
    await watch(['in-studio']);
    await advance(30_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe('null');
  });

  it('does not request on an older bridge, or for an empty list', async () => {
    const read = vi.fn<Read>(() => Promise.resolve(GOOD));
    bridgeStub(read, false);
    await watch(['in-studio']);
    await advance(0);
    expect(read).not.toHaveBeenCalled();
    await watch([]);
    bridgeStub(read, true);
    await watch([]);
    await advance(0);
    expect(read).not.toHaveBeenCalled();
  });
});
