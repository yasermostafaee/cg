// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_SOURCE_ASSIGNMENTS,
  EMPTY_SOURCE_CATALOG,
  type SourceAssignments,
  type SourceBandConfig,
  type SourceCatalog,
} from '@cg/shared-ipc';
import {
  __resetSourcesForTest,
  commitSourceAssignments,
  commitSourceBand,
  currentSourceAssignments,
  currentSourceCatalog,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * D-137 / C-015 phase 4 — the renderer's view of the BRIDGE-owned live sources,
 * in the two halves the model has.
 *
 * Four properties, and each is the reason a specific mistake is not possible:
 *
 *  1. NO OPTIMISTIC UPDATE — a refused commit must leave the operator looking at
 *     what the station actually has, not at what they just typed. Believing a
 *     guest box is bound when it is not is the failure this prevents.
 *  2. AN EMPTY ANSWER IS HONOURED — unlike the delimiter list, where empty means
 *     a broken peer. Here empty is the un-configured station, and hiding it
 *     would be the same false belief by a different route.
 *  3. A REFUSAL NEVER SHOWS A WIRE IDENTIFIER — `invalid request for
 *     sources.set-config` is what an operator actually met, and it names an IPC
 *     channel. Every refusal this surface can produce reads as a sentence.
 *  4. 🔴 `PLAYOUT-SOURCES-01` §1.F — THE BAND IS THE ONLY CATALOGUE FACT THIS CONSOLE SENDS. The
 *     sources are the Playout's; `sources.set-config` carries the plate band and nothing else, and
 *     cascades nothing (the old fourth property, a deletion's cascade mirrored locally, went with
 *     the catalogue editor).
 */

interface SetConfigResult {
  ok: boolean;
  message?: string;
  reason?: string;
}

interface FakeBridge {
  sources: {
    config: () => Promise<SourceCatalog>;
    setConfig: (req: SourceBandConfig) => Promise<SetConfigResult>;
    onConfigChanged: (handler: (c: SourceCatalog) => void) => () => void;
    assignments: () => Promise<SourceAssignments>;
    setAssignments: (
      req: SourceAssignments,
    ) => Promise<{ ok: boolean; message?: string; reason?: string }>;
    onAssignmentsChanged: (handler: (a: SourceAssignments) => void) => () => void;
  };
}

const studioA: SourceCatalog = {
  sources: [{ id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } }],
};
const bound: SourceAssignments = {
  assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }],
};

let storedCatalog: SourceCatalog = EMPTY_SOURCE_CATALOG;
let storedAssignments: SourceAssignments = EMPTY_SOURCE_ASSIGNMENTS;
let configRefusal: { message?: string; reason?: string } | null = null;
let assignmentRefusal: { message?: string; reason?: string } | null = null;
let throwOnSet: Error | null = null;
let pushCatalog: ((c: SourceCatalog) => void) | null = null;
let pushAssignments: ((a: SourceAssignments) => void) | null = null;
const setConfigCalls: SourceBandConfig[] = [];

function installBridge(): FakeBridge {
  const bridge: FakeBridge = {
    sources: {
      config: () => Promise.resolve(storedCatalog),
      setConfig: (req) => {
        setConfigCalls.push(req);
        if (throwOnSet !== null) return Promise.reject(throwOnSet);
        if (configRefusal !== null) return Promise.resolve({ ok: false, ...configRefusal });
        storedCatalog = { ...storedCatalog, ...req };
        return Promise.resolve({ ok: true });
      },
      onConfigChanged: (handler) => {
        pushCatalog = handler;
        return () => {
          pushCatalog = null;
        };
      },
      assignments: () => Promise.resolve(storedAssignments),
      setAssignments: (req) => {
        if (throwOnSet !== null) return Promise.reject(throwOnSet);
        if (assignmentRefusal !== null) return Promise.resolve({ ok: false, ...assignmentRefusal });
        storedAssignments = req;
        return Promise.resolve({ ok: true });
      },
      onAssignmentsChanged: (handler) => {
        pushAssignments = handler;
        return () => {
          pushAssignments = null;
        };
      },
    },
  };
  (window as unknown as { cg: FakeBridge }).cg = bridge;
  return bridge;
}

beforeEach(() => {
  storedCatalog = EMPTY_SOURCE_CATALOG;
  storedAssignments = EMPTY_SOURCE_ASSIGNMENTS;
  configRefusal = null;
  assignmentRefusal = null;
  throwOnSet = null;
  pushCatalog = null;
  pushAssignments = null;
  setConfigCalls.length = 0;
  __resetSourcesForTest();
});

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('the bridge owns both halves; this is a cache', () => {
  it('pulls both at boot and stays subscribed to their pushes', async () => {
    storedCatalog = studioA;
    storedAssignments = bound;
    initSources(installBridge());
    await settle();
    expect(currentSourceCatalog()).toEqual(studioA);
    expect(currentSourceAssignments()).toEqual(bound);

    // A DELETION on another console reaches this one as two pushes, and the
    // second is the one no browser asked for.
    pushCatalog?.(EMPTY_SOURCE_CATALOG);
    pushAssignments?.(EMPTY_SOURCE_ASSIGNMENTS);
    expect(currentSourceCatalog()).toEqual(EMPTY_SOURCE_CATALOG);
    expect(currentSourceAssignments()).toEqual(EMPTY_SOURCE_ASSIGNMENTS);
  });

  it('HONOURS an empty answer — the un-configured station is a real state', async () => {
    initSources(installBridge());
    await settle();
    expect(currentSourceCatalog()).toEqual({ sources: [] });
    expect(currentSourceAssignments()).toEqual({ assignments: [] });
  });
});

describe('a refusal never becomes a local truth, and never shows a wire identifier', () => {
  it('does NOT adopt a refused band', async () => {
    initSources(installBridge());
    await settle();
    configRefusal = { reason: 'overlaps-fixed-bank', message: 'band 60-85 overlaps 80-99' };

    const refusal = await commitSourceBand({ start: 60, end: 85 });
    expect(refusal).not.toBeNull();
    // The RULE comes from the wire's own reason union, and it is the ONE line: the bridge's
    // sentence no longer rides beneath it (`DELTA-MULTI-CHANNEL-01-A` A5).
    expect(refusal).toEqual({
      text: 'The live source layer band would overlap the operator’s candidate layers — the two must stay disjoint.',
    });
    // The cache is what the STATION has, which is no band.
    expect(currentSourceCatalog()).toEqual(EMPTY_SOURCE_CATALOG);
  });

  it('does NOT adopt a refused assignment', async () => {
    initSources(installBridge());
    await settle();
    assignmentRefusal = { reason: 'unknown-source', message: 'plate "guest-1" …' };

    const refusal = await commitSourceAssignments(bound);
    // `PLAYOUT-SOURCES-01` — nothing is "defined on this station" now: the sources are the Playout's.
    expect(refusal?.text).toBe('That source is not one the Playout offers — choose another.');
    expect(currentSourceAssignments()).toEqual(EMPTY_SOURCE_ASSIGNMENTS);
  });

  it('translates the BRIDGE FRAME errors — the operator must never read a channel name', async () => {
    // This is the one an operator actually met: the browser is talking to a
    // bridge PROCESS whose build predates this channel's shape, so the payload
    // is legal here and rejected there. `unknown channel` is its sibling.
    initSources(installBridge());
    await settle();
    for (const message of [
      'invalid request for sources.set-config',
      'unknown channel: sources.set-config',
    ]) {
      throwOnSet = new Error(message);
      const refusal = await commitSourceBand({ start: 60, end: 69 });
      expect(refusal?.text).toContain('older build');
      expect(refusal?.text).not.toContain('sources.set-config');
    }
  });
});

describe('`PLAYOUT-SOURCES-01` §1.F — the band is the only catalogue fact this console sends', () => {
  it('sends the band and nothing else, and keeps the sources the bridge published', async () => {
    storedCatalog = studioA;
    initSources(installBridge());
    await settle();
    expect(await commitSourceBand({ start: 60, end: 69 })).toBeNull();
    // Only `{ layerRange }` crossed the wire — never a source.
    expect(setConfigCalls).toEqual([{ layerRange: { start: 60, end: 69 } }]);
    // Adopted locally once accepted, beside the sources this console did not send.
    expect(currentSourceCatalog()).toEqual({ ...studioA, layerRange: { start: 60, end: 69 } });
  });

  it('control: no band sends an empty request, which clears it', async () => {
    storedCatalog = { ...studioA, layerRange: { start: 60, end: 69 } };
    initSources(installBridge());
    await settle();
    expect(await commitSourceBand(undefined)).toBeNull();
    expect(setConfigCalls).toEqual([{}]);
    expect(currentSourceCatalog().layerRange).toBeUndefined();
  });
});
