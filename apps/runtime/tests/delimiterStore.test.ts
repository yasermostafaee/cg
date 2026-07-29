// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DelimiterOption } from '@cg/shared-ipc';
import {
  __resetDelimitersForTest,
  addDelimiter,
  BUILT_IN_DELIMITERS,
  initDelimiters,
  listDelimiters,
  removeDelimiter,
  resetDelimiters,
} from '../src/renderer/features/inspector/delimiterStore.js';

/**
 * R-034 — the renderer's view of the BRIDGE-owned delimiter list.
 *
 * The ownership is the property under test. A browser-local list would satisfy
 * "survives a refresh" and fail the two that matter — visible from every browser
 * in the gallery, and alive across a bridge restart — so every mutation here
 * must go through the bridge and be adopted only once the bridge accepts it.
 */

interface FakeBridge {
  delimiters: {
    list: () => Promise<DelimiterOption[]>;
    set: (req: {
      delimiters: DelimiterOption[];
    }) => Promise<{ ok: boolean; message?: string; reason?: string }>;
    onChanged: (handler: (d: DelimiterOption[]) => void) => () => void;
  };
}

let stored: DelimiterOption[] = [];
let accept = true;
let push: ((d: DelimiterOption[]) => void) | null = null;
const setCalls: DelimiterOption[][] = [];

function installBridge(): FakeBridge {
  const bridge: FakeBridge = {
    delimiters: {
      list: () => Promise.resolve([...stored]),
      set: ({ delimiters }) => {
        setCalls.push(delimiters);
        if (!accept) return Promise.resolve({ ok: false, message: 'refused by the bridge' });
        stored = [...delimiters];
        return Promise.resolve({ ok: true });
      },
      onChanged: (handler) => {
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

describe('delimiterStore (bridge-owned)', () => {
  beforeEach(() => {
    stored = [...BUILT_IN_DELIMITERS];
    accept = true;
    push = null;
    setCalls.length = 0;
    __resetDelimitersForTest();
  });

  it('shows the shipped list before the bridge answers — never an empty picker', () => {
    expect(listDelimiters()).toEqual(BUILT_IN_DELIMITERS);
    expect(listDelimiters().some((d) => d.value === '،')).toBe(true);
  });

  it('adopts the STATION list the bridge sends, which is what makes it cross-browser', async () => {
    const bridge = installBridge();
    stored = [{ id: 'x', label: 'station tilde', value: '~' }];
    initDelimiters(bridge);
    await vi.waitFor(() => {
      expect(listDelimiters().some((d) => d.value === '~')).toBe(true);
    });
  });

  it('a push from ANOTHER browser updates this one without a reload', async () => {
    const bridge = installBridge();
    initDelimiters(bridge);
    await vi.waitFor(() => expect(push).not.toBeNull());

    push?.([...BUILT_IN_DELIMITERS, { id: 'b', label: 'bullet', value: '•' }]);
    expect(listDelimiters().some((d) => d.value === '•')).toBe(true);
  });

  it('an EMPTY list on the wire is ignored — the picker is never emptied by a peer', async () => {
    const bridge = installBridge();
    initDelimiters(bridge);
    await vi.waitFor(() => expect(push).not.toBeNull());

    push?.([]);
    expect(listDelimiters()).toEqual(BUILT_IN_DELIMITERS);
  });

  it('adding sends the whole list to the bridge and adopts it once accepted', async () => {
    installBridge();
    expect(await addDelimiter('tab', '\\t')).toBeNull();
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]?.some((d) => d.value === '\\t')).toBe(true);
    expect(listDelimiters().some((d) => d.value === '\\t')).toBe(true);
    // It reached the bridge's store, which is what a second browser reads.
    expect(stored.some((d) => d.value === '\\t')).toBe(true);
  });

  it('a bridge REFUSAL is surfaced and NOT adopted locally', async () => {
    installBridge();
    accept = false;
    expect(await addDelimiter('tab', '\\t')).toBe('refused by the bridge');
    // No optimistic adoption: showing a list the station does not have would be
    // a claim that vanishes on the next push.
    expect(listDelimiters().some((d) => d.value === '\\t')).toBe(false);
  });

  it('an OLDER bridge is named as the cause, not left as "unknown channel"', async () => {
    const bridge = installBridge();
    bridge.delimiters.set = () => Promise.reject(new Error('unknown channel: delimiters.set'));

    const refusal = await addDelimiter('tab', '\\t');
    expect(refusal).toMatch(/bridge is older/i);
    expect(refusal).toMatch(/restart/i);
    // And nothing was adopted locally: a private list in one browser is exactly
    // what putting this on the bridge was meant to prevent.
    expect(listDelimiters().some((d) => d.value === '\\t')).toBe(false);
  });

  it('refuses a blank name, an empty delimiter, and a duplicate value without troubling the bridge', async () => {
    installBridge();
    expect(await addDelimiter('  ', '~')).toMatch(/name/i);
    expect(await addDelimiter('nothing', '')).toMatch(/empty/i);
    expect(await addDelimiter('another pipe', '|')).toMatch(/already/i);
    expect(setCalls).toHaveLength(0);
  });

  it('removes a delimiter but REFUSES to empty the list', async () => {
    installBridge();
    for (const d of [...listDelimiters()].slice(1)) await removeDelimiter(d.id);
    expect(listDelimiters()).toHaveLength(1);

    const last = listDelimiters()[0];
    expect(last).toBeDefined();
    expect(await removeDelimiter(last?.id ?? '')).toMatch(/at least one/i);
    expect(listDelimiters()).toHaveLength(1);
  });

  it('reset restores the shipped list, through the bridge', async () => {
    installBridge();
    await addDelimiter('tab', '\\t');
    expect(await resetDelimiters()).toBeNull();
    expect(listDelimiters()).toEqual(BUILT_IN_DELIMITERS);
    expect(stored).toEqual(BUILT_IN_DELIMITERS);
  });
});
