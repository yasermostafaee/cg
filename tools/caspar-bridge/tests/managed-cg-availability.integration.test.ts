import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from '@cg/amcp-mock';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import { CG_MANAGED_STATIC_RESUME_PAGE_MARKER } from '@cg/shared-schema';
import { afterEach, expect, it } from 'vitest';
import { createBridge } from '../src/bridge.js';
import { ManagedCgAvailabilityCommands } from '../src/managed-cg-availability-commands.js';
import { loadManagedCgPilotConfig } from '../src/managed-cg-pilot-config.js';
import {
  availabilityCommandId,
  ManagedCgAvailabilityStore,
} from '../src/managed-cg-availability-store.js';
import { availabilityPair } from './support/managed-availability-pair.js';
import {
  managedTestGroupId as groupId,
  managedTestHtml as html,
} from './support/managed-playout-pair.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function lab() {
  const directory = mkdtempSync(join(tmpdir(), 'cg-managed-availability-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const pair = await availabilityPair(cleanup);
  const store = () => new ManagedCgAvailabilityStore(join(directory, 'controller'));
  const writer = () =>
    new ManagedCgAvailabilityCommands({ groupId, members: pair.members, store: store() });
  return { directory, pair, store, writer };
}

it('continues Bridge Play, Update, Stop and Clear while the reserve API is disconnected', async () => {
  const { directory, pair } = await lab();
  const profile = join(directory, 'managed-cg-pilot.json');
  const environment: NodeJS.ProcessEnv = {};
  const members = pair.members.map(({ operatorBearer, ...mapping }) => {
    const operatorTokenEnv = 'TOKEN_' + mapping.engineId;
    environment[operatorTokenEnv] = operatorBearer();
    return { ...mapping, operatorTokenEnv };
  });
  writeFileSync(
    profile,
    JSON.stringify({ groupId, channel: 1, authorityMode: 'dualReady', members }),
  );
  const configured = loadManagedCgPilotConfig(profile, directory, environment);
  const store = new ManagedCgAvailabilityStore(
    join(configured.stateHome, '.cg-runtime', 'external-cg-availability'),
  );
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
    fixedLayers: { ...bank, visibility: { ...bank.visibility, 81: true } },
    templatesDir: join(directory, 'templates'),
    managedCgPilot: configured.pilot,
  });
  cleanup.push(() => bridge.close());
  const { runtime } = bridge;
  const templateId = 'availability-caption';
  const itemId = 'availability-item';
  expect(
    runtime.templateImport(
      { templateId, templateType: 'lower-third', name: 'Availability caption', fields: [] },
      '<!doctype html><html><head>' + CG_MANAGED_STATIC_RESUME_PAGE_MARKER + '</head></html>',
      1,
    ).registered,
  ).toBe(true);
  expect(
    await runtime.loadFixed({ channel: 1, layer: 81 }, itemId, templateId, { title: 'Original' }),
  ).toMatchObject({ accepted: true });
  expect(await runtime.take(itemId)).toMatchObject({ accepted: true });
  pair.transferCheckpoint('A', 'B');
  const initialLayer = pair.snapshot('B').layers[0];
  expect(initialLayer).toMatchObject({ data: { title: 'Original' }, visibility: 'shown' });
  pair.disconnect('B');

  expect(await runtime.update(itemId, { title: 'Offline edit' }, 'merge')).toMatchObject({
    accepted: true,
  });
  expect(pair.snapshot('A').layers[0]).toMatchObject({ data: { title: 'Offline edit' } });
  expect(await runtime.stopItem(itemId)).toMatchObject({ accepted: true });
  expect(pair.snapshot('A').layers[0]).toMatchObject({ visibility: 'stopped' });
  expect(await runtime.take(itemId)).toMatchObject({ accepted: true });
  expect(pair.snapshot('A').layers[0]).toMatchObject({
    data: { title: 'Offline edit' },
    visibility: 'shown',
  });
  expect(await runtime.out(itemId)).toMatchObject({ accepted: true });
  const cleared = pair.snapshot('A');
  expect(cleared).toMatchObject({ revision: 5, layers: [] });
  expect(pair.snapshot('B').layers).toEqual([initialLayer]);
  expect(store.read()).toMatchObject({
    committed: { intent: { sequence: 5, layout: [] }, requestHash: cleared.requestHash },
    pending: null,
  });

  pair.reconnect('B');
  // Playout transfers one complete checkpoint. The returning Engine does not
  // receive writes or replay the intermediate history from Bridge.
  pair.transferCheckpoint('A', 'B');
  expect(pair.snapshot('B')).toEqual(cleared);
  const restarted = loadManagedCgPilotConfig(profile, directory, environment);
  expect(await restarted.pilot.commands.readAppliedLayout()).toEqual([]);
  expect(pair.posts.map(({ engine, command }) => [engine, command.sequence])).toEqual([
    ['A', 1],
    ['A', 2],
    ['A', 3],
    ['A', 4],
    ['A', 5],
  ]);
  expect(pair.requests.filter(({ engine, method }) => engine === 'B' && method === 'POST')).toEqual(
    [],
  );
  expect(
    core.receivedCommands().filter(({ line }) => /^(?:CG|CLEAR|PLAY|LOADBG|MIXER)\b/i.test(line)),
  ).toEqual([]);
  pair.assertFixtureHealthy();
});

it('reconciles a lost acknowledgement by the original command ID across a Bridge restart', async () => {
  const { pair, store, writer } = await lab();
  pair.loseCommandReply('A');
  const pending = await writer().editLayout(() => [html]);
  const first = pair.posts[0]?.command;
  expect(first).toBeDefined();
  const durable = store().read();
  const id = availabilityCommandId(durable.controllerId, 1);
  expect(pending).toEqual({ status: 'pending', commandId: id });
  expect(first).toMatchObject({ commandId: id, sequence: 1, originEpoch: 1 });
  expect(durable.pending).toMatchObject({ commandId: id, layout: [html] });

  const restarted = writer();
  expect(await restarted.editLayout(() => [])).toEqual(pending);
  expect(await restarted.reconcilePending()).toMatchObject({
    status: 'applied',
    result: { commandId: id },
  });
  expect(pair.requests).toContainEqual({
    engine: 'A',
    method: 'GET',
    route: 'availability/commands/' + id,
  });
  expect(pair.posts).toHaveLength(1);
  expect(store().read()).toMatchObject({ committed: { intent: { commandId: id } }, pending: null });
  expect(await restarted.readAppliedLayout()).toEqual([html]);
  pair.assertFixtureHealthy();
});

it('reconciles the retained unresolved receipt on its selected Engine before allowing new intent', async () => {
  const { pair, writer } = await lab();
  pair.holdNextCommand('A');
  const pending = await writer().editLayout(() => [html]);
  const id = pair.posts[0]?.command.commandId;
  expect(pending).toEqual({ status: 'pending', commandId: id });
  expect(pair.snapshot('A')).toMatchObject({ revision: 0, layers: [] });

  const restarted = writer();
  expect(await restarted.editLayout(() => [])).toEqual(pending);
  expect(await restarted.reconcilePending()).toMatchObject({
    status: 'applied',
    result: { commandId: id },
  });
  expect(pair.requests).toContainEqual({
    engine: 'A',
    method: 'POST',
    route: 'availability/commands/' + id + '/reconcile',
  });
  expect(pair.posts).toHaveLength(1);
  expect(await restarted.readAppliedLayout()).toEqual([html]);
  expect(await restarted.editLayout(() => [])).toMatchObject({
    status: 'applied',
    result: { revision: 2 },
  });
  pair.assertFixtureHealthy();
});

it('restores the latest complete layout on a stale reserve by the same ID and stays selected after A returns', async () => {
  const { pair, store, writer } = await lab();
  const initial = writer();
  expect(await initial.editLayout(() => [html])).toMatchObject({ status: 'applied' });
  pair.transferCheckpoint('A', 'B');
  expect(await initial.editLayout(() => [])).toMatchObject({ status: 'applied' });
  const clear = pair.posts[1]?.command;
  expect(clear).toMatchObject({ sequence: 2, layout: [] });

  pair.disconnect('A');
  const restarted = writer();
  expect(await restarted.editLayout(() => undefined)).toEqual({ status: 'unchanged' });
  expect(
    pair.selections.map(({ engine, request }) => [
      engine,
      request.selection.epoch,
      request.expectedSequence,
    ]),
  ).toEqual([
    ['A', 1, 0],
    ['B', 2, 1],
  ]);
  expect(pair.posts[2]).toMatchObject({
    engine: 'B',
    command: {
      commandId: clear?.commandId,
      sequence: 2,
      originEpoch: 1,
      selection: { engineId: 'B', epoch: 2 },
      resumeWithoutReplay: true,
      layout: [],
    },
  });
  expect(pair.snapshot('B').layers).toEqual([]);

  pair.reconnect('A');
  const caption = { ...html, data: { title: 'After failover' } };
  expect(await writer().editLayout(() => [caption])).toMatchObject({ status: 'applied' });
  expect(pair.posts.map(({ engine, command }) => [engine, command.sequence])).toEqual([
    ['A', 1],
    ['A', 2],
    ['B', 2],
    ['B', 3],
  ]);
  expect(store().read().selected?.selection).toMatchObject({ engineId: 'B', epoch: 2 });
  expect(pair.snapshot('B').layers).toEqual([caption]);
  pair.assertFixtureHealthy();
});

it('replays the exact pending intent on B when A disappears after a lost response', async () => {
  const { pair, store, writer } = await lab();
  const initial = writer();
  expect(await initial.editLayout(() => [html])).toMatchObject({ status: 'applied' });
  pair.transferCheckpoint('A', 'B');
  pair.loseCommandReply('A');
  const pending = await initial.editLayout(() => []);
  const clear = pair.posts[1]?.command;
  expect(pending).toEqual({ status: 'pending', commandId: clear?.commandId });
  pair.disconnect('A');

  const restarted = writer();
  expect(await restarted.reconcilePending()).toMatchObject({
    status: 'applied',
    result: { commandId: clear?.commandId },
  });
  expect(pair.requests).toContainEqual({
    engine: 'B',
    method: 'GET',
    route: 'availability/commands/' + clear?.commandId,
  });
  expect(pair.posts[2]).toMatchObject({
    engine: 'B',
    command: {
      commandId: clear?.commandId,
      sequence: clear?.sequence,
      originEpoch: clear?.originEpoch,
      operation: clear?.operation,
      layout: clear?.layout,
      selection: { engineId: 'B', epoch: 2 },
      resumeWithoutReplay: true,
    },
  });
  expect(store().read()).toMatchObject({
    committed: { intent: { commandId: clear?.commandId, layout: [] } },
    pending: null,
    selected: { selection: { engineId: 'B' } },
  });
  expect(pair.snapshot('B').layers).toEqual([]);
  expect(pair.posts).toHaveLength(3);
  pair.assertFixtureHealthy();
});

it('refuses a newer checkpoint on B when the current target becomes unreachable', async () => {
  const { pair, store, writer } = await lab();
  expect(await writer().editLayout(() => [html])).toMatchObject({ status: 'applied' });
  pair.transferCheckpoint('A', 'B');
  pair.exposeNewerCheckpoint('B');
  pair.disconnect('A');

  await expect(writer().editLayout(() => [])).rejects.toThrow('ahead of the durable Bridge state');
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A']);
  expect(pair.selections.map(({ engine }) => engine)).toEqual(['A']);
  expect(store().read()).toMatchObject({
    lastSequence: 1,
    selected: { selection: { engineId: 'A' } },
    pending: null,
  });
  expect(pair.snapshot('B')).toMatchObject({ revision: 2, layers: [html] });
  pair.assertFixtureHealthy();
});

it('does not take over a nonempty Engine with a fresh controller state', async () => {
  const { pair, store, writer } = await lab();
  pair.exposeNewerCheckpoint('A');
  await expect(writer().editLayout(() => [html])).rejects.toThrow(
    'ahead of the durable Bridge state',
  );
  expect(pair.selections).toEqual([]);
  expect(pair.posts).toEqual([]);
  expect(store().read()).toMatchObject({ selected: null, pending: null });
  pair.assertFixtureHealthy();
});

it('keeps local validation failures out of the command journal', async () => {
  const { pair, store, writer } = await lab();
  const proposed = { ...html, layer: 5 };
  await expect(writer().editLayout(() => [proposed])).rejects.toThrow('permitted kind or range');
  expect(pair.posts).toEqual([]);
  expect(store().read()).toMatchObject({ lastSequence: 0, pending: null });
  expect(await writer().editLayout(() => [html])).toMatchObject({ status: 'applied' });
  expect(pair.posts[0]?.command.sequence).toBe(1);
  pair.assertFixtureHealthy();
});

it.each(['breakAuth', 'misMap'] as const)(
  'keeps the established selection when the owner check fails with %s',
  async (breakEngine) => {
    const { pair, store, writer } = await lab();
    expect(await writer().editLayout(() => [html])).toMatchObject({ status: 'applied' });
    pair.transferCheckpoint('A', 'B');
    pair[breakEngine]('A');

    await expect(writer().editLayout(() => [])).rejects.toThrow();
    expect(pair.posts.map(({ engine }) => engine)).toEqual(['A']);
    expect(pair.selections.map(({ engine }) => engine)).toEqual(['A']);
    expect(store().read()).toMatchObject({
      lastSequence: 1,
      selected: { selection: { engineId: 'A', epoch: 1 } },
      pending: null,
    });
    pair.assertFixtureHealthy();
  },
);
