import { afterEach, expect, it } from 'vitest';
import { ManagedCgStack } from '../src/managed-cg-stack.js';
import {
  managedTestGroupId as groupId,
  managedTestHtml as html,
  playoutPair,
} from './support/managed-playout-pair.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

it('sends the whole layout to the confirmed owner only and honours the new mapping after transfer', async () => {
  const pair = await playoutPair(cleanup);
  const writer = pair.executor();

  expect(await writer.submitLayout([html])).toMatchObject({ status: 'applied' });
  expect(pair.posts).toEqual([
    {
      engine: 'A',
      command: expect.objectContaining({
        target: { engineId: 'A', channelCode: 'cg-a', nativeChannel: 1, layer: 60 },
        expectedFence: pair.fence('A'),
        expectedRevision: 0,
        operation: 'layout',
        layout: [html],
      }),
    },
  ]);
  expect(pair.requests).toContain('B:GET:owner');
  expect(pair.journal().get(groupId)).toBeUndefined();

  pair.switchOwner();
  expect(await writer.submitLayout([html])).toMatchObject({ status: 'applied' });
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'B']);
  expect(pair.posts[1]?.command).toMatchObject({
    target: { engineId: 'B', channelCode: 'cg-b', nativeChannel: 2, layer: 60 },
    expectedFence: pair.fence('B'),
    expectedRevision: 1,
  });
  expect(pair.posts[1]?.command.commandId).not.toBe(pair.posts[0]?.command.commandId);
});

it.each(['conflict', 'expire'] as const)(
  'does not send a layout when the owner check reports %s',
  async (reason) => {
    const pair = await playoutPair(cleanup);
    pair[reason]();
    await expect(pair.executor().submitLayout([html])).rejects.toThrow('unique managed CG owner');
    expect(pair.posts).toEqual([]);
    expect(pair.journal().get(groupId)).toBeUndefined();
  },
);

it('recovers the original receipt after an interrupted reply and never repeats the layout on B', async () => {
  const pair = await playoutPair(cleanup);
  pair.loseResponse();
  const pending = await pair.executor().submitLayout([html]);
  const commandId = pair.posts[0]?.command.commandId;
  expect(pending).toEqual({ status: 'pending', commandId });
  expect(pair.journal().get(groupId)).toMatchObject({ commandId });

  pair.switchOwner();
  pair.restoreResponse();
  const restarted = pair.executor();
  expect(await restarted.submitLayout([html])).toEqual(pending);
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A']);

  expect(await restarted.reconcilePending()).toMatchObject({
    status: 'rolledBack',
    result: { commandId, revision: 1, retainedState: { revision: 0 } },
  });
  expect(pair.reads.sort()).toEqual(['A', 'B']);
  expect(pair.recoveries).toEqual(['A']);
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A']);

  expect(await restarted.submitLayout([html])).toMatchObject({ status: 'applied' });
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'B']);
  expect(pair.posts[1]?.command.expectedRevision).toBe(1);
});

it('retains the reservation after a mismatched receipt and can verify the same result on a replica', async () => {
  const pair = await playoutPair(cleanup);
  pair.corruptResponse();

  const writer = pair.executor();
  const first = await writer.submitLayout([html]);
  expect(first).toMatchObject({ status: 'pending' });
  expect(pair.journal().get(groupId)).toBeDefined();

  pair.useReplicaEvidence();
  expect(await writer.reconcilePending()).toMatchObject({ status: 'applied' });
  expect(pair.posts).toHaveLength(1);
  expect(pair.recoveries).toEqual([]);
  expect(pair.journal().get(groupId)).toBeUndefined();
});

it('prepares matching template bundles on both engines without applying a layout', async () => {
  const pair = await playoutPair(cleanup);
  const writer = pair.executor();
  await expect(writer.prepareTemplate(html.template)).resolves.toBe('8'.repeat(64));
  expect(pair.staged.sort()).toEqual(['A', 'B']);
  expect(pair.posts).toEqual([]);
  expect(pair.journal().get(groupId)).toBeUndefined();

  pair.stageDifferentBundle();
  await expect(writer.prepareTemplate(html.template)).rejects.toThrow('different copies');
  expect(pair.posts).toEqual([]);
});

it('applies managed row controls to the full layout and recovers absolute state after handoff', async () => {
  const pair = await playoutPair(cleanup);
  pair.seedLayout([html]);
  const stack = new ManagedCgStack(pair.executor(), () => 1_700_000_000_000);
  const row = { rowId: 'retained-item', layer: 81 };
  expect(await stack.apply({ ...row, operation: 'update', data: { title: 'draft' } })).toEqual({
    status: 'unchanged',
    layer: undefined,
  });
  expect(pair.posts).toHaveLength(0);
  expect(
    await stack.apply({
      ...row,
      operation: 'take',
      template: html.template,
      data: { title: 'first', old: 'remove' },
    }),
  ).toMatchObject({ status: 'applied' });
  const taken = pair.posts[0]?.command.layout[1];
  expect(taken).toMatchObject({
    layer: 81,
    page: 0,
    visibility: 'shown',
    animationOrigin: '2023-11-14T22:13:20.000Z',
  });
  expect(pair.posts[0]?.command.expectedRevision).toBe(1);
  expect(pair.posts[0]?.command.layout[0]).toEqual(html);

  const updated = await stack.apply({ ...row, operation: 'update', data: { title: 'new' } });
  expect(updated).toMatchObject({
    status: 'applied',
    layer: { graphicInstanceId: taken?.graphicInstanceId, animationOrigin: taken?.animationOrigin },
  });
  expect(pair.posts[1]?.command.layout[1]?.data).toEqual({ title: 'new' });
  expect(await stack.apply({ ...row, operation: 'stop' })).toMatchObject({
    status: 'applied',
    layer: { visibility: 'stopped' },
  });

  pair.switchOwner();
  const restarted = new ManagedCgStack(pair.executor());
  expect(await restarted.inspect(row.rowId, row.layer)).toMatchObject({
    graphicInstanceId: taken?.graphicInstanceId,
    animationOrigin: taken?.animationOrigin,
    visibility: 'stopped',
    data: { title: 'new' },
  });
  await expect(restarted.apply({ ...row, operation: 'next' })).rejects.toThrow('no next page');
  expect(await restarted.apply({ ...row, operation: 'out' })).toMatchObject({
    status: 'applied',
    layer: undefined,
  });
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A', 'A', 'B']);
  expect(pair.posts[3]?.command.layout).toEqual([html]);
});

it.each(['makeAppliedStatePending', 'makeAppliedStateStale'] as const)(
  'refuses row writes when owner state is not settled: %s',
  async (invalidate) => {
    const pair = await playoutPair(cleanup);
    pair.seedLayout([html]);
    pair[invalidate]();
    const stack = new ManagedCgStack(pair.executor());
    await expect(
      stack.apply({
        rowId: 'another-row',
        layer: 81,
        operation: 'take',
        template: html.template,
        data: {},
      }),
    ).rejects.toThrow('current applied managed CG layout');
    expect(pair.posts).toHaveLength(0);
    expect(pair.journal().get(groupId)).toBeUndefined();
  },
);

it('does not clear a trapped or externally owned managed layer', async () => {
  const pair = await playoutPair(cleanup);
  pair.seedLayout([html]);
  const stack = new ManagedCgStack(pair.executor());
  await expect(
    stack.apply({ rowId: 'unrelated-operator-row', layer: 80, operation: 'clear' }),
  ).rejects.toThrow('occupied by another graphic');
  expect(pair.posts).toHaveLength(0);
});

it('checks retained field values and template version against the same applied snapshot used to post', async () => {
  const pair = await playoutPair(cleanup);
  const stack = new ManagedCgStack(pair.executor());
  const row = { rowId: 'editor-test', layer: 81 };
  await stack.apply({
    ...row,
    operation: 'take',
    template: html.template,
    data: { title: 'original' },
  });
  await expect(
    stack.apply({
      ...row,
      operation: 'update',
      data: { title: 'target' },
      expectedData: { title: 'old' },
    }),
  ).rejects.toThrow('data changed');
  await expect(
    stack.apply({
      ...row,
      operation: 'update',
      data: { title: 'target' },
      expectedTemplateVersion: 'another-template',
    }),
  ).rejects.toThrow('version on Playout');
  expect(pair.posts).toHaveLength(1);
  expect(pair.journal().get(groupId)).toBeUndefined();
  expect(
    await stack.apply({
      ...row,
      operation: 'update',
      data: { title: 'target' },
      expectedData: { title: 'original' },
      expectedTemplateVersion: html.template.version,
    }),
  ).toMatchObject({ status: 'applied', layer: { data: { title: 'target' } } });
});

it('keeps the prepared manifest when an equivalent template is served from a new address', async () => {
  const pair = await playoutPair(cleanup);
  const row = { rowId: 'stable-assets', layer: 81 };
  const data = { title: 'retained' };
  const stack = new ManagedCgStack(pair.executor());
  await stack.apply({ ...row, operation: 'take', template: html.template, data });
  await stack.apply({ ...row, operation: 'stop' });
  pair.switchOwner();
  const restarted = new ManagedCgStack(pair.executor());
  const moved = {
    ...html.template,
    assets: html.template.assets.map((asset) => ({
      ...asset,
      uri: 'http://127.0.0.1:4321/template.html',
    })),
  };
  expect(
    await restarted.apply({
      ...row,
      operation: 'take',
      template: moved,
      expectedTemplateVersion: html.template.version,
      expectedData: data,
      data,
    }),
  ).toMatchObject({ status: 'applied', layer: { template: html.template, visibility: 'shown' } });
  const changed = {
    ...moved,
    assets: moved.assets.map((asset) => ({ ...asset, sha256: 'a'.repeat(64) })),
  };
  await expect(
    restarted.apply({ ...row, operation: 'take', template: changed, data }),
  ).rejects.toThrow('keep its prepared template');
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A', 'B']);
});
