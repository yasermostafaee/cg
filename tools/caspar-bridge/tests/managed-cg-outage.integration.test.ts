import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from '@cg/amcp-mock';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import { CG_MANAGED_STATIC_RESUME_PAGE_MARKER } from '@cg/shared-schema';
import { afterEach, expect, it } from 'vitest';
import { createBridge } from '../src/bridge.js';
import { managedTestGroupId, playoutPair } from './support/managed-playout-pair.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const templateId = 'outage-caption';
const itemId = 'playing-caption';
const otherItemId = 'prepared-row';

async function boot() {
  const directory = mkdtempSync(join(tmpdir(), 'cg-managed-outage-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const pair = await playoutPair(cleanup);
  const core = await createMock({ amcpPort: 0 });
  cleanup.push(() => core.stop());
  const bank = defaultFixedLayerBank();
  const bridge = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: core.amcpPort, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: { ...bank, visibility: { ...bank.visibility, 81: true, 82: true } },
    templatesDir: join(directory, 'templates'),
    managedCgPilot: { channel: 1, commands: pair.executor() },
  });
  cleanup.push(() => bridge.close());
  const { runtime } = bridge;
  expect(
    runtime.templateImport(
      { templateId, templateType: 'lower-third', name: 'Outage caption', fields: [] },
      '<!doctype html><html><head>' + CG_MANAGED_STATIC_RESUME_PAGE_MARKER + '</head></html>',
      1,
    ).registered,
  ).toBe(true);
  expect(
    await runtime.loadFixed({ channel: 1, layer: 81 }, itemId, templateId, { title: 'Before' }),
  ).toMatchObject({ accepted: true });
  expect(
    await runtime.loadFixed({ channel: 1, layer: 82 }, otherItemId, templateId, { title: 'Other' }),
  ).toMatchObject({ accepted: true });
  expect(await runtime.take(itemId)).toMatchObject({ accepted: true });
  return { runtime, pair };
}

it('refuses a Play without B template preparation but updates an applied row through A with quorum', async () => {
  const { runtime, pair } = await boot();
  const baseline = await pair.readState('B');
  pair.pauseBackupReplica();
  pair.disconnectBackupApi();

  expect(await runtime.take(otherItemId)).toMatchObject({
    accepted: false,
    message: 'Playout did not confirm the template on Engine B.',
  });
  expect(pair.posts).toHaveLength(1);
  expect(pair.journal().get(managedTestGroupId)).toBeUndefined();
  const attemptsBeforeUpdate = pair.requests.filter((request) =>
    request.endsWith(':templates:prepare'),
  ).length;
  expect(await runtime.update(itemId, { title: 'After' }, 'merge')).toMatchObject({
    accepted: true,
  });
  expect(pair.requests.filter((request) => request.endsWith(':templates:prepare'))).toHaveLength(
    attemptsBeforeUpdate,
  );

  const owner = await pair.readState('A');
  expect(owner.snapshot.layers).toEqual([
    { ...baseline.snapshot.layers[0], data: { title: 'After' } },
  ]);
  expect(owner.replica.appliedRevision).toBe(owner.snapshot.revision);
  expect(pair.journal().get(managedTestGroupId)).toBeUndefined();

  pair.reconnectBackupApi();
  const lagging = await pair.readState('B');
  expect(lagging.snapshot).toEqual(owner.snapshot);
  expect(lagging.replica.appliedRevision).toBe(baseline.replica.appliedRevision);
  expect(lagging.replica.appliedRevision).toBeLessThan(owner.replica.appliedRevision);

  pair.catchUpBackupReplica();
  const caughtUp = await pair.readState('B');
  expect(caughtUp.snapshot).toEqual(owner.snapshot);
  expect(caughtUp.replica.appliedRevision).toBe(owner.replica.appliedRevision);
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A']);
});

it('refuses a new layout before journaling when A cannot confirm quorum', async () => {
  const { runtime, pair } = await boot();
  const before = await pair.readState('A');
  pair.disconnectBackupApi();
  pair.setQuorumAvailable(false);

  expect(await runtime.update(itemId, { title: 'During outage' }, 'merge')).toMatchObject({
    accepted: false,
    message: 'Playout has not confirmed a unique managed CG owner.',
  });
  expect(await runtime.out(itemId)).toMatchObject({
    accepted: false,
    errorCode: 'managed-cg-unavailable',
  });
  expect(pair.posts).toHaveLength(1);
  expect(pair.journal().get(managedTestGroupId)).toBeUndefined();
  expect((await pair.readState('A')).snapshot).toEqual(before.snapshot);

  pair.reconnectBackupApi();
  pair.setQuorumAvailable(true);
  expect((await pair.readState('B')).snapshot).toEqual(before.snapshot);
  expect(pair.posts).toHaveLength(1);
  expect(await runtime.update(itemId, { title: 'After quorum restored' }, 'merge')).toMatchObject({
    accepted: true,
  });
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A']);
  expect((await pair.readState('B')).snapshot.layers[0]?.data).toEqual({
    title: 'After quorum restored',
  });
});

it('commits Clear through A when B retains its vote but cannot apply the Native layout yet', async () => {
  const { runtime, pair } = await boot();
  const baseline = await pair.readState('B');
  pair.pauseBackupReplica();
  pair.disconnectBackupApi();
  expect(await runtime.out(itemId)).toMatchObject({ accepted: true });
  const cleared = await pair.readState('A');
  expect(cleared.snapshot.layers).toEqual([]);
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A']);
  pair.reconnectBackupApi();
  expect((await pair.readState('B')).replica.appliedRevision).toBe(
    baseline.replica.appliedRevision,
  );
  pair.catchUpBackupReplica();
  const synchronized = await pair.readState('B');
  expect(synchronized.snapshot.layers).toEqual([]);
  expect(synchronized.replica.appliedRevision).toBe(cleared.replica.appliedRevision);
});
