// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_SOURCE_ASSIGNMENTS,
  EMPTY_SOURCE_CATALOG,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateSourceAssignment,
} from '@cg/shared-ipc';
import {
  __resetSourcesForTest,
  commitSourceAssignments,
  commitSourceCatalog,
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
 *  4. A DELETION'S CASCADE IS MIRRORED LOCALLY — the bridge drops the
 *     assignments a retired source orphaned, and this browser must not paint a
 *     plate as bound in the frames between the ack and the push.
 */

interface SetConfigResult {
  ok: boolean;
  message?: string;
  reason?: string;
  droppedAssignments?: TemplateSourceAssignment[];
}

interface FakeBridge {
  sources: {
    config: () => Promise<SourceCatalog>;
    setConfig: (req: SourceCatalog) => Promise<SetConfigResult>;
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
let dropOnSet: TemplateSourceAssignment[] | null = null;
let throwOnSet: Error | null = null;
let pushCatalog: ((c: SourceCatalog) => void) | null = null;
let pushAssignments: ((a: SourceAssignments) => void) | null = null;
const setConfigCalls: SourceCatalog[] = [];

function installBridge(): FakeBridge {
  const bridge: FakeBridge = {
    sources: {
      config: () => Promise.resolve(storedCatalog),
      setConfig: (req) => {
        setConfigCalls.push(req);
        if (throwOnSet !== null) return Promise.reject(throwOnSet);
        if (configRefusal !== null) return Promise.resolve({ ok: false, ...configRefusal });
        storedCatalog = req;
        return Promise.resolve(
          dropOnSet === null ? { ok: true } : { ok: true, droppedAssignments: dropOnSet },
        );
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
  dropOnSet = null;
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
  it('does NOT adopt a refused catalog', async () => {
    initSources(installBridge());
    await settle();
    configRefusal = { reason: 'duplicate-name', message: 'two sources are called "Studio A"' };

    const { refusal } = await commitSourceCatalog(studioA);
    expect(refusal).not.toBeNull();
    // The RULE comes from the wire's own reason union; the bridge's sentence is
    // the DETAIL beneath it.
    expect(refusal?.text).toContain('Another source already has that name');
    expect(refusal?.detail).toContain('Studio A');
    // The cache is what the STATION has, which is nothing.
    expect(currentSourceCatalog()).toEqual(EMPTY_SOURCE_CATALOG);
  });

  it('does NOT adopt a refused assignment', async () => {
    initSources(installBridge());
    await settle();
    assignmentRefusal = { reason: 'unknown-source', message: 'plate "guest-1" …' };

    const refusal = await commitSourceAssignments(bound);
    expect(refusal?.text).toContain('no longer defined on this station');
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
      const { refusal } = await commitSourceCatalog(studioA);
      expect(refusal?.text).toContain('older build');
      expect(refusal?.text).not.toContain('sources.set-config');
    }
  });
});

describe('deleting a source cascades, and this browser mirrors it at once', () => {
  it('drops the orphaned bindings locally rather than waiting for the push', async () => {
    storedCatalog = studioA;
    storedAssignments = bound;
    initSources(installBridge());
    await settle();

    dropOnSet = [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }];
    const { refusal, droppedAssignments } = await commitSourceCatalog(EMPTY_SOURCE_CATALOG);

    expect(refusal).toBeNull();
    // Handed back so the surface can NAME them at the moment of deletion — an
    // operator who learns at the take is learning too late.
    expect(droppedAssignments).toEqual(dropOnSet);
    // …and gone from the cache, with no push involved: a frame showing a plate
    // as bound to a source that no longer exists is the thing being prevented.
    expect(currentSourceAssignments()).toEqual({ assignments: [] });
  });

  it('sends the WHOLE catalog, never a delta', async () => {
    initSources(installBridge());
    await settle();
    await commitSourceCatalog(studioA);
    expect(setConfigCalls).toEqual([studioA]);
  });
});
