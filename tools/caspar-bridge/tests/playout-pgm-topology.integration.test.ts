import { expect, it, vi } from 'vitest';
import { PgmTopologySchema, type PgmTopology, type TicketPath } from '@cg/shared-ipc';
import type { PlayoutPgmMember } from '../src/playout-pgm-topology.js';
import { openClient } from './support/auth-harness.js';
import { startFakePlayout } from './support/fake-playout.js';
import { startFakePgmFeed } from './support/fake-pgm-feed.js';
import { track } from './support/harness.js';
import { twoChannelRig, waitUntil } from './support/two-channel-rig.js';

it('scopes topology and every physical return ticket to the authorized logical channel and stream', async () => {
  const playout = track(await startFakePlayout(), (p) => p.stop());
  const feed = track(await startFakePgmFeed(), (p) => p.stop());
  const member = (
    origin: string,
    code: string,
    name: string,
    channel: number,
  ): PlayoutPgmMember => ({
    key: origin,
    name,
    channelCode: code,
    physicalChannel: channel,
    pgmHost: '127.0.0.1',
  });
  const readTopology = vi.fn(async (url: URL, code: string) => ({
    members: [
      member(url.origin, code, 'Primary', 1),
      member('http://engine-b.test:8080', 'backup-b', 'Reserve B', 2),
      member('http://engine-c.test:8080', 'backup-c', 'Reserve C', 3),
      member('http://engine-d.test:8080', 'backup-d', 'Reserve D', 4),
    ],
    activeMemberKey: 'http://engine-c.test:8080',
  }));
  const rig = await twoChannelRig({
    bridge: {
      playout: {
        auth: 'playout',
        issuer: playout.issuer,
        jwksUrl: playout.jwksUrl,
        tokenUrl: playout.tokenUrl,
        refreshUrl: playout.refreshUrl,
        revokedUrl: playout.revokedUrl,
        channelsUrl: playout.channelsUrl,
      },
      pgmReturn: { portFor: () => feed.port, readTopology },
    },
  });
  const operator = await openClient(rig.handle);
  expect(
    (await operator.authenticate('sign-in', (await playout.issueToken({ user: 'operator' })).token))
      .error,
  ).toBeUndefined();
  const response = (topology: unknown): PgmTopology | null =>
    PgmTopologySchema.nullable().parse(topology);
  let topology: PgmTopology | null = null;
  await rig.handle.playoutCatalogue?.refresh();
  expect(rig.handle.playoutCatalogue?.rows()).toMatchObject([
    { id: 'fake-programme', casparHost: '127.0.0.1', casparChannel: 1 },
    { id: 'fake-cg', casparChannel: 2 },
  ]);
  await waitUntil(async () => {
    const answer = await operator.ask('topology-one', 'pgmReturn.topology', { channel: 1 });
    expect(answer.error).toBeUndefined();
    topology = response(answer.payload);
    return topology !== null;
  }, 'the authorized D4 channel joins the topology');
  const observed = PgmTopologySchema.parse(topology);
  expect(observed.members.map(({ engine, physicalChannel }) => [engine, physicalChannel])).toEqual([
    ['A', 1],
    ['B', 2],
    ['C', 3],
    ['D', 4],
  ]);
  expect(observed.active).toBe('C');
  expect(feed.connections).toHaveLength(0);

  const denied = await operator.ask('topology-two', 'pgmReturn.topology', { channel: 2 });
  expect(denied.error).toBeDefined();
  expect(readTopology).toHaveBeenCalledTimes(1);

  const c = observed.members.find(({ engine }) => engine === 'C');
  if (c === undefined) throw new Error('Missing C fixture');
  for (const [channel, engine, resourceKey] of [
    [2, 'C', c.resourceKey],
    [1, 'D', c.resourceKey],
    [1, 'C', 'stale-resource-key'],
  ] as const) {
    const wrong = await operator.ask('wrong-ticket', 'pgmReturn.ticket', {
      channel,
      engine,
      resourceKey,
    });
    expect(wrong.error).toBeDefined();
  }
  const ticket = await operator.ask('correct-ticket', 'pgmReturn.ticket', {
    channel: 1,
    engine: 'C',
    resourceKey: c.resourceKey,
  });
  expect(ticket.error).toBeUndefined();
  const { path } = ticket.payload as TicketPath;
  const url = 'http://127.0.0.1:' + String(rig.handle.port) + path;
  const crossEngine = await fetch(url.replace('/pgm/C/', '/pgm/D/'), { method: 'HEAD' });
  expect(crossEngine.status).toBe(403);
  const crossStream = await fetch(url.replace('?', '/sound?'), { method: 'HEAD' });
  expect(crossStream.status).toBe(403);
  expect(feed.connections).toHaveLength(0);

  const watching = new AbortController();
  try {
    const picture = await fetch(url, { signal: watching.signal });
    expect(picture.status).toBe(200);
    expect(picture.headers.get('content-type')).toMatch(/^multipart\/x-mixed-replace/);
    await waitUntil(() => Promise.resolve(feed.connections.length === 1), 'the C programme feed');
    await waitUntil(
      () =>
        Promise.resolve(
          operator
            .publishes()
            .some(
              (frame) =>
                frame.type === 'publish' &&
                frame.channel === 'pgmReturn.status-changed' &&
                Array.isArray(frame.payload) &&
                frame.payload.some(
                  (status) =>
                    status.engine === 'C' &&
                    status.channel === 1 &&
                    status.resourceKey === c.resourceKey &&
                    status.state === 'live',
                ),
            ),
        ),
      'the C relay publishes its exact resource identity',
    );
  } finally {
    watching.abort();
  }
});
