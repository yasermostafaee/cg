import { once } from 'node:events';
import http from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { PlayoutPgmMonitors } from '../src/playout-pgm-monitors.js';
import type {
  PlayoutPgmMember,
  PlayoutPgmTopology,
  readPlayoutPgmTopology,
} from '../src/playout-pgm-topology.js';
import { startFakePgmFeed } from './support/fake-pgm-feed.js';

const origin = new URL('http://127.0.0.1:8080');
const logicalChannel = 1;
const code = 'station-channel';

function peer(name: string, physicalChannel: number): PlayoutPgmMember {
  return {
    key: name === 'Alpha' ? origin.origin : 'http://' + name.toLowerCase() + '.invalid:8080',
    channelCode: name.toLowerCase(),
    name,
    physicalChannel,
    pgmHost: '127.0.0.1',
  };
}

function requireMember(member: PlayoutPgmTopology['members'][number] | undefined) {
  if (member === undefined) throw new Error('Missing fixture member');
  return member;
}

describe('PlayoutPgmMonitors', () => {
  it('keeps A–D and their resources stable when the topology reorders and D is promoted', async () => {
    const peers = [
      peer('Alpha', logicalChannel),
      peer('Bravo', 3),
      peer('Charlie', 5),
      peer('Delta', 7),
    ];
    const read = vi
      .fn()
      .mockResolvedValueOnce({ members: peers, activeMemberKey: requireMember(peers[0]).key })
      .mockResolvedValueOnce({
        members: [requireMember(peers[0]), ...peers.slice(1).reverse()],
        activeMemberKey: requireMember(peers[3]).key,
      });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const monitors = new PlayoutPgmMonitors(origin, {}, read);
    const changed = vi.fn();
    const unsubscribe = monitors.subscribe(changed);

    try {
      const [first, concurrent] = await Promise.all([
        monitors.topology(logicalChannel, code),
        monitors.topology(logicalChannel, code),
      ]);
      expect(read).toHaveBeenCalledTimes(1);
      expect(concurrent).toBe(first);
      expect(first?.active).toBe('A');
      expect(
        first?.members.map(({ engine, name, physicalChannel }) => [engine, name, physicalChannel]),
      ).toEqual([
        ['A', 'Alpha', logicalChannel],
        ['B', 'Bravo', 3],
        ['C', 'Charlie', 5],
        ['D', 'Delta', 7],
      ]);

      const charlie = first?.members.find(({ engine }) => engine === 'C');
      if (charlie === undefined) throw new Error('Missing Charlie');
      expect(monitors.hasSource(logicalChannel, 'C', charlie.resourceKey)).toBe(true);
      expect(monitors.hasSource(logicalChannel + 1, 'C', charlie.resourceKey)).toBe(false);
      expect(monitors.hasSource(logicalChannel, 'D', charlie.resourceKey)).toBe(false);

      expect(await monitors.topology(logicalChannel, code)).toBe(first);
      expect(read).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(6_000);
      const promoted = await monitors.topology(logicalChannel, code);
      expect(promoted?.active).toBe('D');
      expect(promoted?.members).toEqual(first?.members);
      expect(monitors.status()).toEqual([]);
      expect(changed).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      monitors.dispose();
      clock.mockRestore();
    }
  });

  it('refuses a mismatched original output and an answer from an earlier channel binding', async () => {
    const read = vi.fn<typeof readPlayoutPgmTopology>();
    let finishOld: ((value: PlayoutPgmTopology) => void) | undefined;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const alpha = peer('Alpha', logicalChannel);
    read.mockResolvedValueOnce({ members: [alpha], activeMemberKey: alpha.key });
    read.mockResolvedValueOnce({
      members: [{ ...alpha, physicalChannel: logicalChannel + 1 }],
      activeMemberKey: alpha.key,
    });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const monitors = new PlayoutPgmMonitors(origin, {}, read);

    try {
      const oldBinding = monitors.topology(logicalChannel, 'old-code');
      const newBinding = await monitors.topology(logicalChannel, 'new-code');
      const member = newBinding?.members[0];
      if (member === undefined || finishOld === undefined) throw new Error('Missing fixtures');
      finishOld({ members: [alpha, peer('Bravo', 10)], activeMemberKey: alpha.key });
      expect(await oldBinding).toBeNull();
      expect(await monitors.topology(logicalChannel, 'new-code')).toBe(newBinding);
      expect(monitors.hasSource(logicalChannel, 'A', member.resourceKey)).toBe(true);

      clock.mockReturnValue(6_000);
      const mismatched = await monitors.topology(logicalChannel, 'new-code');
      expect(mismatched?.active).toBeNull();
      expect(mismatched?.members[0]?.physicalChannel).toBeNull();
      expect(monitors.hasSource(logicalChannel, 'A', member.resourceKey)).toBe(false);
    } finally {
      monitors.dispose();
      clock.mockRestore();
    }
  });

  it('expires the mapping without a monitor poll and ignores its unfinished refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(1_000);
    const alpha = peer('Alpha', logicalChannel);
    const snapshot = { members: [alpha], activeMemberKey: alpha.key };
    let finishRefresh: ((value: PlayoutPgmTopology) => void) | undefined;
    const read = vi.fn<typeof readPlayoutPgmTopology>().mockResolvedValueOnce(snapshot);
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    read.mockResolvedValueOnce(snapshot);
    const monitors = new PlayoutPgmMonitors(origin, {}, read);
    const changed = vi.fn();
    const unsubscribe = monitors.subscribe(changed);
    try {
      const initial = await monitors.topology(logicalChannel, code);
      const member = initial?.members[0];
      if (member === undefined) throw new Error('Missing initial mapping');

      await vi.advanceTimersByTimeAsync(5_000);
      const refreshing = monitors.topology(logicalChannel, code);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(monitors.hasSource(logicalChannel, 'A', member.resourceKey)).toBe(true);
      expect(changed).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(monitors.hasSource(logicalChannel, 'A', member.resourceKey)).toBe(false);
      if (finishRefresh === undefined) throw new Error('Missing outstanding refresh');
      finishRefresh(snapshot);
      const expired = await refreshing;
      expect(expired?.active).toBeNull();
      expect(expired?.members[0]?.physicalChannel).toBeNull();

      const refreshed = await monitors.topology(logicalChannel, code);
      const replacement = refreshed?.members[0];
      if (replacement === undefined) throw new Error('Missing replacement mapping');
      expect(replacement.resourceKey).not.toBe(member.resourceKey);
      expect(monitors.hasSource(logicalChannel, 'A', replacement.resourceKey)).toBe(true);

      // Expiration is checked on lookup even if the event loop has not run the timer.
      vi.setSystemTime(31_000);
      expect(monitors.sourceOrigin(logicalChannel, 'A', replacement.resourceKey)).toBeUndefined();
      expect(monitors.hasSource(logicalChannel, 'A', replacement.resourceKey)).toBe(false);
    } finally {
      unsubscribe();
      monitors.dispose();
      vi.useRealTimers();
    }
  });

  it('opens the physical feed only for a viewer, shares it and closes both viewers on remap', async () => {
    const initial = peer('Alpha', logicalChannel);
    const backup = peer('Bravo', 11);
    let topology: PlayoutPgmTopology | null = {
      members: [initial, backup],
      activeMemberKey: initial.key,
    };
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const feed = await startFakePgmFeed({ fps: 24 });
    const portFor = vi.fn(() => feed.port);
    const monitors = new PlayoutPgmMonitors(origin, { portFor }, async () => topology);
    const controller = new AbortController();
    const server = http.createServer((req, res) => {
      const [key = '', suffix] = req.url?.slice(1).split('/') ?? [];
      const stream = suffix === 'sound' ? 'audio' : 'picture';
      if (!monitors.serve(req, res, logicalChannel, 'B', key, stream)) res.writeHead(404).end();
    });

    try {
      const started = once(server, 'listening');
      server.listen(0, '127.0.0.1');
      await started;
      const endpoint = server.address();
      if (endpoint === null || typeof endpoint === 'string') throw new Error('Missing server port');
      const view = (key: string, sound = false) =>
        fetch('http://127.0.0.1:' + String(endpoint.port) + '/' + key + (sound ? '/sound' : ''), {
          signal: controller.signal,
        });
      const first = await monitors.topology(logicalChannel, code);
      const before = first?.members.find(({ engine }) => engine === 'B');
      if (before === undefined) throw new Error('Missing backup');
      expect(feed.connections).toHaveLength(0);
      expect(portFor).not.toHaveBeenCalled();

      const [viewer1, viewer2] = await Promise.all([
        view(before.resourceKey),
        view(before.resourceKey),
      ]);
      expect([viewer1.status, viewer2.status]).toEqual([200, 200]);
      const firstStream = viewer1.body?.getReader();
      const secondStream = viewer2.body?.getReader();
      if (firstStream === undefined || secondStream === undefined)
        throw new Error('Missing viewers');
      expect((await firstStream.read()).done).toBe(false);
      expect((await secondStream.read()).done).toBe(false);
      expect(portFor.mock.calls).toEqual([[11]]);
      expect(feed.connections).toHaveLength(1);
      expect(monitors.status()).toEqual([
        { channel: logicalChannel, engine: 'B', resourceKey: before.resourceKey, state: 'live' },
      ]);

      clock.mockReturnValue(6_000);
      topology = { members: [initial, { ...backup, physicalChannel: 12 }], activeMemberKey: null };
      const remapped = await monitors.topology(logicalChannel, code);
      const after = remapped?.members.find(({ engine }) => engine === 'B');
      if (after === undefined) throw new Error('Missing remapped backup');
      expect(after.resourceKey).not.toBe(before.resourceKey);
      expect(monitors.hasSource(logicalChannel, 'B', before.resourceKey)).toBe(false);
      expect(monitors.hasSource(logicalChannel, 'B', after.resourceKey)).toBe(true);
      expect((await view(before.resourceKey)).status).toBe(404);
      await Promise.all(
        [firstStream, secondStream].map(async (stream) => {
          while (!(await stream.read()).done) {
            // Drain already buffered frames before checking that the viewer's stream ended.
          }
        }),
      );
      await vi.waitFor(() => expect(feed.openCount()).toBe(0));
      expect(portFor).toHaveBeenCalledTimes(1);
      expect(monitors.status()).toEqual([]);

      const [replacementPicture, replacementSound] = await Promise.all([
        view(after.resourceKey),
        view(after.resourceKey, true),
      ]);
      const picture = replacementPicture.body?.getReader();
      const sound = replacementSound.body?.getReader();
      if (picture === undefined || sound === undefined)
        throw new Error('Missing replacement viewers');
      expect((await picture.read()).done).toBe(false);
      expect((await sound.read()).done).toBe(false);
      expect(feed.openCount()).toBe(1);
      expect(feed.audioOpenCount()).toBe(1);

      // A ticket lookup reaches the deadline before the real-time timer in this test.
      clock.mockReturnValue(21_000);
      expect((await view(after.resourceKey)).status).toBe(404);
      expect((await view(after.resourceKey, true)).status).toBe(404);
      await Promise.all(
        [picture, sound].map(async (stream) => {
          while (!(await stream.read()).done) {
            // Drain buffered bytes until the expiration closes each viewer.
          }
        }),
      );
      await vi.waitFor(() => {
        expect(feed.openCount()).toBe(0);
        expect(feed.audioOpenCount()).toBe(0);
      });

      topology = null;
      const unavailable = await monitors.topology(logicalChannel, code);
      expect(unavailable?.active).toBeNull();
      expect(
        unavailable?.members.map(({ name, physicalChannel }) => [name, physicalChannel]),
      ).toEqual([
        ['Alpha', null],
        ['Bravo', null],
      ]);
      expect((await view(after.resourceKey)).status).toBe(404);
      expect(portFor.mock.calls).toEqual([[11], [12], [12]]);
    } finally {
      controller.abort();
      monitors.dispose();
      if (server.listening) {
        const closed = once(server, 'close');
        server.close();
        server.closeAllConnections();
        await closed;
      }
      await feed.stop();
      clock.mockRestore();
    }
  });
});
