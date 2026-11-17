import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../src/auth-session.js';
import { RoutedSourceReads } from '../src/routed-source-reads.js';
import { SourcePreviewService } from '../src/source-preview-service.js';
import { track } from './support/harness.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {
    throw new Error('Deferred was not initialized');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(prepare: (ids: readonly string[]) => Promise<void>) {
  const nodePvw = vi.spyOn(SourcePreviewService.prototype, 'pvw').mockResolvedValue({ frames: [] });
  const reads = track(
    new RoutedSourceReads({
      prepare: async (_owner, _channel, ids) => {
        await prepare(ids);
        return new Map(ids.map((id) => [id, 'B' as const]));
      },
      target: () => null,
      selector: () => null,
      mediaId: () => null,
    }),
    (held) => held.dispose(),
  );
  const owner = new AuthSession();
  return { reads, owner, nodePvw };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('routed PVW preparation intent', () => {
  it('never passes a superseded view to either node after its delayed route lookup finishes', async () => {
    const oldLookup = deferred();
    const { reads, owner, nodePvw } = fixture(async (ids) => {
      if (ids.includes('old-input')) await oldLookup.promise;
    });
    const oldView = randomUUID();
    const newView = randomUUID();
    const old = reads.pvw(owner, { channel: 1, viewId: oldView, sourceIds: ['old-input'] });
    await reads.pvw(owner, { channel: 1, viewId: newView, sourceIds: ['new-input'] });
    expect(nodePvw.mock.calls.map(([, request]) => request.viewId)).toEqual([newView, newView]);
    oldLookup.resolve();
    expect(await old).toEqual({ frames: [] });
    expect(nodePvw.mock.calls.map(([, request]) => request.viewId)).toEqual([newView, newView]);
  });

  it('does not recreate a node view after drop while preparation is pending', async () => {
    const lookup = deferred();
    const { reads, owner, nodePvw } = fixture(async () => lookup.promise);
    const work = reads.pvw(owner, { channel: 1, viewId: randomUUID(), sourceIds: ['input'] });
    await reads.drop(owner);
    lookup.resolve();
    expect(await work).toEqual({ frames: [] });
    expect(nodePvw).not.toHaveBeenCalled();
  });

  it('preserves a newer empty-view close instead of reopening the earlier input', async () => {
    const lookup = deferred();
    const { reads, owner, nodePvw } = fixture(async (ids) => {
      if (ids.length > 0) await lookup.promise;
    });
    const viewId = randomUUID();
    const work = reads.pvw(owner, { channel: 1, viewId, sourceIds: ['old-input'] });
    await reads.pvw(owner, { channel: 1, viewId, sourceIds: [] });
    expect(nodePvw.mock.calls.map(([, request]) => request.sourceIds)).toEqual([[], []]);
    lookup.resolve();
    expect(await work).toEqual({ frames: [] });
    expect(nodePvw.mock.calls.map(([, request]) => request.sourceIds)).toEqual([[], []]);
  });

  it('allows the pending PVW intent to finish while passive thumbnail and audio requests run', async () => {
    const lookup = deferred();
    const { reads, owner, nodePvw } = fixture(async (ids) => {
      if (ids.includes('pvw-input')) await lookup.promise;
    });
    const viewId = randomUUID();
    const work = reads.pvw(owner, { channel: 1, viewId, sourceIds: ['pvw-input'] });
    await reads.thumbnails(owner, { channel: 1, sourceIds: ['picker-input'] });
    await reads.read(owner, { channel: 1, sourceIds: ['meter-input'] });
    lookup.resolve();
    await work;
    expect(nodePvw.mock.calls.map(([, request]) => request.viewId)).toEqual([viewId, viewId]);
    expect(nodePvw.mock.calls.map(([, request]) => request.sourceIds)).toEqual([[], ['pvw-input']]);
  });
});
