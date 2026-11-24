import { expect, it, vi } from 'vitest';
import { PgmTopologySchema, type PgmTopology, type TicketPath } from '@cg/shared-ipc';
import type {
  PlayoutPgmMember,
  PlayoutPgmTopology,
  PlayoutPgmTopologyOptions,
} from '../src/playout-pgm-topology.js';
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

it('keeps the reserve return available to an authenticated console after the primary D4 stops answering', async () => {
  const playout = track(await startFakePlayout(), (p) => p.stop());
  const feed = track(await startFakePgmFeed({ fps: 24 }), (p) => p.stop());
  let primaryOffline = false;
  const readTopology = vi.fn(
    (
      url: URL,
      code: string,
      options?: PlayoutPgmTopologyOptions,
    ): Promise<PlayoutPgmTopology | null> => {
      if (primaryOffline) {
        const previous = options?.previous;
        if (previous?.recovery === undefined) return Promise.resolve(null);
        return Promise.resolve({
          ...previous,
          activeMemberKey: null,
          degraded: true,
          members: previous.members.map((peer) =>
            peer.key === url.origin ? { ...peer, physicalChannel: null, pgmHost: null } : peer,
          ),
        });
      }
      const primary = {
        key: url.origin,
        channelCode: code,
        name: 'Primary',
        physicalChannel: 1,
        pgmHost: '127.0.0.1',
      };
      const reserve = {
        key: 'http://reserve.test:8080',
        channelCode: 'backup-b',
        name: 'Reserve',
        physicalChannel: 7,
        pgmHost: '127.0.0.1',
      };
      const aliases = new Set([url.origin]);
      return Promise.resolve({
        members: [primary, reserve],
        activeMemberKey: primary.key,
        recovery: {
          primary,
          primaryAliases: aliases,
          master: { origin: url, channelCode: code },
          masterAliases: aliases,
          peers: [reserve],
        },
      });
    },
  );
  const portFor = vi.fn(() => feed.port);
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
      pgmReturn: { portFor, readTopology },
    },
  });
  const operator = await openClient(rig.handle);
  expect(
    (await operator.authenticate('sign-in', (await playout.issueToken({ user: 'operator' })).token))
      .error,
  ).toBeUndefined();
  const catalogue = rig.handle.playoutCatalogue;
  if (catalogue === null) throw new Error('Missing authenticated D4 reader');
  await catalogue.refresh();
  expect(catalogue.rows()).not.toBeNull();
  const initial = await operator.ask('initial-topology', 'pgmReturn.topology', { channel: 1 });
  expect(initial.error).toBeUndefined();
  const topology = PgmTopologySchema.parse(initial.payload);
  const reserve = topology.members.find(({ engine }) => engine === 'B');
  if (reserve === undefined) throw new Error('Missing B return');
  expect(topology.active).toBe('A');
  expect(reserve.physicalChannel).toBe(7);

  const watching = new AbortController();
  const watchReserve = async (id: string) => {
    const ticket = await operator.ask(id, 'pgmReturn.ticket', {
      channel: 1,
      engine: 'B',
      resourceKey: reserve.resourceKey,
    });
    expect(ticket.error).toBeUndefined();
    const { path } = ticket.payload as TicketPath;
    const picture = await fetch('http://127.0.0.1:' + String(rig.handle.port) + path, {
      signal: watching.signal,
    });
    expect(picture.status).toBe(200);
    const reader = picture.body?.getReader();
    if (reader === undefined) throw new Error('Missing B stream');
    expect((await reader.read()).done).toBe(false);
  };

  const now = Date.now.bind(Date);
  const clock = vi.spyOn(Date, 'now').mockImplementation(now);
  try {
    await watchReserve('picture-before-outage');
    expect(feed.openCount()).toBe(1);
    const frames = feed.connections[0]?.framesSent ?? 0;

    await playout.goOffline();
    primaryOffline = true;
    clock.mockImplementation(() => now() + 5_001);
    await catalogue.refresh();
    expect(catalogue.rows()).toBeNull();
    const outage = await operator.ask('outage-topology', 'pgmReturn.topology', { channel: 1 });
    expect(outage.error).toBeUndefined();
    expect(PgmTopologySchema.parse(outage.payload)).toMatchObject({
      channel: 1,
      active: null,
      members: [{ engine: 'A', physicalChannel: null }, reserve],
    });
    expect(portFor.mock.calls).toEqual([[7]]);
    expect(feed.openCount()).toBe(1);
    await watchReserve('picture-during-outage');
    await waitUntil(
      () => (feed.connections[0]?.framesSent ?? 0) > frames,
      'the original reserve connection to continue sending frames',
    );
    expect(feed.connections).toHaveLength(1);
    expect(feed.openCount()).toBe(1);
    expect(portFor.mock.calls).toEqual([[7]]);
  } finally {
    watching.abort();
    clock.mockRestore();
  }
});
